import { PointerEvent, useEffect, useRef, useState } from "react";

interface SnipModalProps {
  id: string,
  src: string | null,
  onSnip: (dataURL: string) => void
}

interface Seed {
  index: number,
  r: number, g: number, b: number
}

interface WorkImage {
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
  // How hard each pixel is to reach from the clicked points, lower joins the selection sooner
  addCost: Uint8Array,
  // Same, from the right-clicked points that hold the selection back
  removeCost: Uint8Array,
  // Pen strokes, these override the click selection
  paint: Int8Array
}

type Tool = "wand" | "pen";
type Mode = "add" | "remove";

// Large photos are scaled down to keep the selection responsive
const MAX_WORK_SIZE = 1024;
const UNREACHABLE = 255;
const MAX_THRESHOLD = 160;
const MIN_ALPHA = 16;
const DEFAULT_REACH = 25;
const DEFAULT_FADE = 20;
const DEFAULT_PEN_SIZE = 15;
// Pen size 100 covers this fraction of the image's longer side
const MAX_PEN_FRACTION = 0.2;
const PAINT_ADD = 1;
const PAINT_REMOVE = -1;
const RIGHT_BUTTON = 2;

const colorDistance = (pixels: Uint8ClampedArray, offset: number, r: number, g: number, b: number) => {
  const dr = pixels[offset] - r;
  const dg = pixels[offset + 1] - g;
  const db = pixels[offset + 2] - b;
  return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
};

// Grow outward from every clicked point. A pixel's cost is the biggest jump met on the easiest
// path to it, where a jump mixes "how far from the clicked color" with "how sharp is this edge".
// The slider then only has to threshold the cost, so the selection always grows as it moves up.
const growRegions = (pixels: Uint8ClampedArray, width: number, height: number, seeds: Seed[]) => {
  const pixelCount = width * height;
  const cost = new Uint8Array(pixelCount).fill(UNREACHABLE);
  if (seeds.length === 0) return cost;
  // Bucket per cost level, holding (pixel index, seed index) pairs
  const buckets: number[][] = Array.from({ length: UNREACHABLE }, () => []);
  seeds.forEach((seed, seedIndex) => buckets[0].push(seed.index, seedIndex));

  for (let level = 0; level < UNREACHABLE; level++) {
    const bucket = buckets[level];
    while (bucket.length > 0) {
      const seedIndex = bucket.pop() as number;
      const index = bucket.pop() as number;
      if (cost[index] !== UNREACHABLE) continue;
      cost[index] = level;

      const seed = seeds[seedIndex];
      const offset = index * 4;
      const x = index % width;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        index >= width ? index - width : -1,
        index < pixelCount - width ? index + width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor < 0 || cost[neighbor] !== UNREACHABLE) continue;
        const neighborOffset = neighbor * 4;
        // Never grow through transparent pixels
        if (pixels[neighborOffset + 3] < MIN_ALPHA) continue;
        const fromSeed = colorDistance(pixels, neighborOffset, seed.r, seed.g, seed.b);
        const edge = Math.min(255, 3 * colorDistance(pixels, neighborOffset, pixels[offset], pixels[offset + 1], pixels[offset + 2]));
        const jump = Math.min(UNREACHABLE - 1, Math.round((fromSeed + edge) / 2));
        buckets[Math.max(level, jump)].push(neighbor, seedIndex);
      }
    }
  }
  return cost;
};

// A pixel is in when the pen added it, or when it's within reach of a clicked point
// and no right-clicked point has a better claim on it
const isSelected = (work: WorkImage, index: number, threshold: number) => {
  if (work.paint[index] !== 0) return work.paint[index] === PAINT_ADD;
  return work.addCost[index] <= threshold && work.addCost[index] <= work.removeCost[index];
};

// Pen radius in image pixels for a 1-100 size setting
const penRadius = (work: WorkImage, penSize: number) => {
  return Math.max(0.5, penSize / 100 * MAX_PEN_FRACTION * Math.max(work.width, work.height) / 2);
};

const SnipModal = ({ id, src, onSnip }: SnipModalProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workRef = useRef<WorkImage | null>(null);
  const addSeedsRef = useRef<Seed[]>([]);
  const removeSeedsRef = useRef<Seed[]>([]);
  // Pen stroke in progress: what it paints and where it last was
  const strokeRef = useRef<{ value: number, x: number, y: number } | null>(null);
  const hoverRef = useRef<{ x: number, y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("wand");
  const [mode, setMode] = useState<Mode>("add");
  // How visible the unselected part of the image stays, in percent
  const [fade, setFade] = useState(DEFAULT_FADE);
  const [reach, setReach] = useState(DEFAULT_REACH);
  const [penSize, setPenSize] = useState(DEFAULT_PEN_SIZE);
  // Bumped whenever the image, the clicked points or the pen strokes change
  const [version, setVersion] = useState(0);
  const [hasSeeds, setHasSeeds] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);

  const threshold = Math.round(reach / 100 * MAX_THRESHOLD);
  const redraw = () => { setVersion((current) => current + 1) };

  // Spacebar flips between adding and removing while the dialog is open
  useEffect(() => {
    const isOpen = () => document.getElementById(id)?.classList.contains("show") ?? false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !isOpen()) return;
      // Keep the page from scrolling and the focused button from being pressed
      event.preventDefault();
      if (!event.repeat) setMode((current) => current === "add" ? "remove" : "add");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space" && isOpen()) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    }
  }, [id]);

  // Load the image to snip from
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const scale = Math.min(1, MAX_WORK_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      const context = scratch.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      workRef.current = {
        width, height, pixels,
        addCost: new Uint8Array(width * height).fill(UNREACHABLE),
        removeCost: new Uint8Array(width * height).fill(UNREACHABLE),
        paint: new Int8Array(width * height)
      };
      addSeedsRef.current = [];
      removeSeedsRef.current = [];
      setHasSeeds(false);
      setHasSelection(false);
      setReach(DEFAULT_REACH);
      setVersion((current) => current + 1);
    };
    image.src = src;
    return () => { cancelled = true; }
  }, [src]);

  // Draw the preview, everything outside the selection is faded out
  useEffect(() => {
    const canvas = canvasRef.current;
    const work = workRef.current;
    if (!canvas || !work) return;
    canvas.width = work.width;
    canvas.height = work.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const preview = new ImageData(new Uint8ClampedArray(work.pixels), work.width, work.height);
    for (let index = 0; index < work.paint.length; index++) {
      if (!isSelected(work, index, threshold)) preview.data[index * 4 + 3] *= fade / 100;
    }
    context.putImageData(preview, 0, 0);

    // Pen outline under the cursor
    const hover = hoverRef.current;
    if (tool === "pen" && hover) {
      const radius = penRadius(work, penSize);
      const lineWidth = Math.max(1, work.width / canvas.getBoundingClientRect().width);
      context.beginPath();
      context.arc(hover.x, hover.y, radius, 0, Math.PI * 2);
      context.lineWidth = lineWidth * 3;
      context.strokeStyle = "rgba(0, 0, 0, 0.6)";
      context.stroke();
      context.lineWidth = lineWidth;
      context.strokeStyle = "#ffffff";
      context.stroke();
    }
  }, [threshold, version, tool, penSize, fade]);

  // Position of a pointer event in image pixels
  const toImagePosition = (event: PointerEvent<HTMLCanvasElement>, work: WorkImage) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * work.width,
      y: (event.clientY - bounds.top) / bounds.height * work.height
    };
  };

  const addSeed = (work: WorkImage, position: { x: number, y: number }, remove: boolean) => {
    const x = Math.min(work.width - 1, Math.max(0, Math.floor(position.x)));
    const y = Math.min(work.height - 1, Math.max(0, Math.floor(position.y)));
    const index = y * work.width + x;
    const offset = index * 4;
    // Nothing to select on a transparent spot
    if (work.pixels[offset + 3] < MIN_ALPHA) return;
    const seed = { index, r: work.pixels[offset], g: work.pixels[offset + 1], b: work.pixels[offset + 2] };
    if (remove) {
      removeSeedsRef.current = [...removeSeedsRef.current, seed];
      work.removeCost = growRegions(work.pixels, work.width, work.height, removeSeedsRef.current);
    } else {
      addSeedsRef.current = [...addSeedsRef.current, seed];
      work.addCost = growRegions(work.pixels, work.width, work.height, addSeedsRef.current);
      setHasSeeds(true);
      setHasSelection(true);
    }
  };

  // Paint a pen stroke segment as a run of overlapping circles
  const paintLine = (work: WorkImage, from: { x: number, y: number }, to: { x: number, y: number }, value: number) => {
    const radius = penRadius(work, penSize);
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, radius / 2)));
    for (let step = 0; step <= steps; step++) {
      const centerX = from.x + (to.x - from.x) * step / steps;
      const centerY = from.y + (to.y - from.y) * step / steps;
      const minX = Math.max(0, Math.floor(centerX - radius));
      const maxX = Math.min(work.width - 1, Math.ceil(centerX + radius));
      const minY = Math.max(0, Math.floor(centerY - radius));
      const maxY = Math.min(work.height - 1, Math.ceil(centerY + radius));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          if (Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) <= radius) work.paint[y * work.width + x] = value;
        }
      }
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const work = workRef.current;
    if (!work) return;
    const position = toImagePosition(event, work);
    // Right click always removes, whatever the switch says
    const remove = mode === "remove" || event.button === RIGHT_BUTTON;
    if (tool === "wand") {
      addSeed(work, position, remove);
    } else {
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeRef.current = { value: remove ? PAINT_REMOVE : PAINT_ADD, ...position };
      paintLine(work, position, position, strokeRef.current.value);
      if (!remove) setHasSelection(true);
    }
    redraw();
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const work = workRef.current;
    if (!work || tool !== "pen") return;
    const position = toImagePosition(event, work);
    hoverRef.current = position;
    const stroke = strokeRef.current;
    if (stroke) {
      paintLine(work, stroke, position, stroke.value);
      strokeRef.current = { value: stroke.value, ...position };
    }
    redraw();
  };

  const handlePointerUp = () => { strokeRef.current = null; };

  const handlePointerLeave = () => {
    hoverRef.current = null;
    redraw();
  };

  const clearSelection = () => {
    const work = workRef.current;
    if (!work) return;
    addSeedsRef.current = [];
    removeSeedsRef.current = [];
    work.addCost.fill(UNREACHABLE);
    work.removeCost.fill(UNREACHABLE);
    work.paint.fill(0);
    setHasSeeds(false);
    setHasSelection(false);
    redraw();
  };

  // Cut the selection out, cropped to its bounds, with everything else transparent
  const handleSnip = () => {
    const work = workRef.current;
    if (!work) return;
    const { width, height, pixels } = work;
    const selected = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && isSelected(work, y * width + x, threshold);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!selected(x, y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return;

    const snipWidth = maxX - minX + 1;
    const snipHeight = maxY - minY + 1;
    const snip = new ImageData(snipWidth, snipHeight);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!selected(x, y)) continue;
        // Soften the cut edge by how much of the surrounding 3x3 is selected
        let coverage = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (selected(x + dx, y + dy)) coverage++;
        const from = (y * width + x) * 4;
        const to = ((y - minY) * snipWidth + (x - minX)) * 4;
        snip.data[to] = pixels[from];
        snip.data[to + 1] = pixels[from + 1];
        snip.data[to + 2] = pixels[from + 2];
        snip.data[to + 3] = pixels[from + 3] * coverage / 9;
      }
    }

    const output = document.createElement("canvas");
    output.width = snipWidth;
    output.height = snipHeight;
    output.getContext("2d")?.putImageData(snip, 0, 0);
    onSnip(output.toDataURL());
  };

  return (
    <div className="modal fade snip-modal" id={id} tabIndex={-1} aria-labelledby={`${id}Label`}>
      <div className="modal-dialog modal-lg modal-fullscreen-lg-down">
        <div className="modal-content">
          <div className="modal-header bg-body-tertiary">
            <h5 className="modal-title" id={`${id}Label`}><strong>Snip a sticker</strong></h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div className="modal-body text-center">
            {/* Image beside the controls, so both fit on a phone held sideways */}
            <div className="row align-items-center">
              <div className="col-12 col-sm-7">
                <canvas
                  ref={canvasRef}
                  className="snip-canvas rounded border"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerLeave}
                  onContextMenu={(event) => { event.preventDefault() }} />
              </div>
              <div className="col-12 col-sm-5">
                {/* Tool choice */}
                <div className="btn-group mb-2 me-1" role="group" aria-label="Snip tool">
                  <input type="radio" className="btn-check" name={`${id}Tool`} id={`${id}ToolWand`} checked={tool === "wand"} onChange={() => { setTool("wand") }} />
                  <label className="btn btn-outline-secondary" htmlFor={`${id}ToolWand`}>Smart select <i className="bi bi-magic ms-1"></i></label>
                  <input type="radio" className="btn-check" name={`${id}Tool`} id={`${id}ToolPen`} checked={tool === "pen"} onChange={() => { setTool("pen") }} />
                  <label className="btn btn-outline-secondary" htmlFor={`${id}ToolPen`}>Pen <i className="bi bi-brush-fill ms-1"></i></label>
                </div>
                {/* Add/remove switch */}
                <div className="btn-group mb-2 ms-1" role="group" aria-label="Add or remove">
                  <input type="radio" className="btn-check" name={`${id}Mode`} id={`${id}ModeAdd`} checked={mode === "add"} onChange={() => { setMode("add") }} />
                  <label className="btn btn-outline-success" htmlFor={`${id}ModeAdd`}>Add <i className="bi bi-plus-circle-fill ms-1"></i></label>
                  <input type="radio" className="btn-check" name={`${id}Mode`} id={`${id}ModeRemove`} checked={mode === "remove"} onChange={() => { setMode("remove") }} />
                  <label className="btn btn-outline-danger" htmlFor={`${id}ModeRemove`}>Remove <i className="bi bi-dash-circle-fill ms-1"></i></label>
                </div>
                <p className="form-text snip-help">
                  {
                    tool === "wand"
                      ? (mode === "add"
                        ? "Tap the part you want. Drag the reach slider to grow or shrink the selection."
                        : "Tap a part to keep out of the selection.")
                      : (mode === "add"
                        ? "Drag over the image to add to the selection."
                        : "Drag over the image to remove from the selection.")
                  }
                  <span className="d-none d-md-inline"> Spacebar switches add/remove, right click always removes.</span>
                </p>
                {
                  tool === "wand"
                    ?
                    <div>
                      <label htmlFor={`${id}Reach`} className="form-label mt-2 d-block">Selection reach</label>
                      <input
                        type="range"
                        className="form-range"
                        id={`${id}Reach`}
                        min={0}
                        max={100}
                        value={reach}
                        disabled={!hasSeeds}
                        onChange={(event) => { setReach(Number(event.target.value)) }} />
                    </div>
                    :
                    <div>
                      <label htmlFor={`${id}PenSize`} className="form-label mt-2 d-block">Pen size</label>
                      <input
                        type="range"
                        className="form-range"
                        id={`${id}PenSize`}
                        min={1}
                        max={100}
                        value={penSize}
                        onChange={(event) => { setPenSize(Number(event.target.value)) }} />
                    </div>
                }
                <label htmlFor={`${id}Fade`} className="form-label mt-2 d-block">Unselected area visibility</label>
                <input
                  type="range"
                  className="form-range"
                  id={`${id}Fade`}
                  min={0}
                  max={100}
                  value={fade}
                  onChange={(event) => { setFade(Number(event.target.value)) }} />
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" disabled={!hasSelection} onClick={clearSelection}>
              Clear selection <i className="bi bi-eraser-fill ms-1"></i>
            </button>
            <button type="button" className="btn btn-warning" data-bs-dismiss="modal" disabled={!hasSelection} onClick={handleSnip}>
              Add as sticker <i className="bi bi-scissors ms-1"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnipModal;
