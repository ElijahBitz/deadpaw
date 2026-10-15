### **Snip a sticker**

`October 13th, 2026`

#### **Feature** 💡

You can now cut a piece out of any image in your edit and use it as its own sticker. Select an image, hit **Snip**, mark the part you want and click **Add as sticker**.

There are two tools for marking the selection:

- **Smart select**: tap the part you want and it picks up the similar-looking area around that spot. The **reach** slider grows or shrinks it.
- **Pen**: drag over the image to paint the selection by hand, with an adjustable pen size.

Both tools have an **Add** and a **Remove** mode, so you can start with smart select and tidy up the edges with the pen. On desktop, spacebar switches between the two modes and right click always removes.

#### **Implementation** 💻

Everything happens in the browser on a canvas. Large images are scaled down first so the selection stays responsive.

**Smart select** grows outward from each tapped point and gives every pixel a cost: how different it is from the tapped color, mixed with how sharp the edge is that had to be crossed to reach it. This is only calculated once per tap. The reach slider just sets the cutoff on that cost, which is why dragging it is instant. Remove taps work the same way and win a pixel whenever they have the cheaper path to it.

**The pen** is a separate layer on top of that. Each pixel is marked as added, removed or untouched, and a stroke is drawn as a run of overlapping circles between pointer positions. Painted pixels always override smart select, so the pen has the final say in both directions.

When you snip, the selection is cropped to its bounds, the cut edge is softened a little so it doesn't look jagged, and the result is dropped into the edit as a regular image you can move, scale and rotate.
