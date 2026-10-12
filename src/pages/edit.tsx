import { SyntheticEvent, useEffect, useState } from "react";
import Image from "next/image";
import { initializeModel, removeBackground } from "@/background-remover";
import NavBar from "@/components/navbar";
import DefaultHead from "@/components/default-head";
import CustomModal from "@/components/custom-modal";
import Playground from "@/components/playground/playground";
import { useIsMobile } from "@/useIsMobile";
import { clearDraft, DraftState, loadDraft, startDraft } from "@/draftStore";

const Edit = () => {
  const isMobile = useIsMobile();
  const [editState, setEditState] = useState("loading");
  // Edit process:
  // 0. loading (checking for a saved draft)
  // 1. upload
  // 2. remove-bg
  // 3. playground

  //#region Base image upload

  const [baseImageFile, setBaseImageFile] = useState<File | null>(null);
  const [baseImageURL, setBaseImageURL] = useState("/images/placeholder.png");
  const [bgRemovedImageURL, setBgRemovedImageURL] = useState("/images/placeholder.png");
  const [bgRemovalDone, setBgRemovalDone] = useState(false);

  const goToRemoveBG = () => {
    if (!baseImageFile) return;
    setEditState("remove-bg");
  };

  const onBaseImageChange = (event: SyntheticEvent) => {
    const files = (event.target as HTMLInputElement).files;
    if (!files) return;
    const file = files[0];
    if (!file) return;
    setBaseImageFile(file);
    setBaseImageURL(URL.createObjectURL(file));
    setBgRemovedImageURL(URL.createObjectURL(file));
  }

  const uploadDisplay = () => {
    return (
      <div className="container">
        {/* Mobile prompt */}
        {
          isMobile
            ?
            <div>
              <p className="text-body-tertiary fst-italic text-center">
                Looks like you&apos;re using <strong>Deadpaw</strong> on a mobile device, I recommend turning the device to landscape mode for the best experience.
              </p>
            </div>
            :
            <div></div>
        }

        <h5 className="text-center">Upload a base pet photo</h5>
        {/* Upload form */}
        <form className="w-75 mx-auto" id="upload-form">
          <input className="form-control" type="file" accept="image/*" id="imageInput" name="imageInput" onChange={onBaseImageChange}></input>
          <label htmlFor="imageInput" className="form-label text-body-secondary">Choose the photo you want to edit</label>
          <br />
        </form>
        <hr />
        {/* Preview */}
        <div className="text-center">
          <Image className="img-fluid rounded w-25" src={baseImageURL} alt="Preview" width={400} height={600} placeholder="blur" blurDataURL="automatic" />
          <br />
          {
            baseImageFile
              ?
              <button type="button" className="btn btn-warning m-2" onClick={goToRemoveBG}>Start editing! <i className="bi bi-pencil-fill ms-1"></i></button>
              :
              <button type="button" className="btn btn-warning m-2" data-bs-toggle="modal" data-bs-target="#uploadErrorModal">Start editing! <i className="bi bi-pencil-fill ms-1"></i></button>
          }
          <CustomModal id="uploadErrorModal" title="No photo uploaded" content={<p>Upload a base pet photo to start editing</p>} />
        </div>
      </div>
    )
  };

  //#endregion

  //#region Remove image background

  const removeBG = async () => {
    setBgRemovedImageURL("/images/processing-placeholder.png");
    await initializeModel();
    removeBackground(baseImageFile).then((img) => {
      const src = URL.createObjectURL(img);
      setBgRemovedImageURL(src);
      setBgRemovalDone(true);
    });
  };

  const goToPlayground = async (noBackground = false) => {
    const chosenURL = noBackground ? bgRemovedImageURL : baseImageURL;
    setBaseImageURL(chosenURL);
    setEditState("playground");
    // Keep the chosen photo so the edit survives a refresh
    try {
      const response = await fetch(chosenURL);
      await startDraft(await response.blob());
    } catch (error) {
      console.error("Could not save draft", error);
    }
  };

  const removeBGDisplay = () => {
    return (
      <div className="container">
        {
          bgRemovalDone
            ?
            // Which photo prompt
            <div className="text-center">
              <h5><strong>Use this?</strong></h5>
              <p>Choose which photo to edit</p>
              <div className="row">
                <div className="col text-end">
                  <Image className="img-fluid rounded w-50" src={baseImageURL} alt="Original photo" width={400} height={600} placeholder="blur" blurDataURL="automatic" />
                  <br />
                  <button type="button" className="btn btn-secondary m-2" onClick={() => { goToPlayground() }}>The OG <i className="bi bi-hand-index-fill ms-1"></i></button>
                </div>
                <div className="col text-start">
                  <Image className="img-fluid rounded w-50" src={bgRemovedImageURL} alt="BG removed photo" width={400} height={600} placeholder="blur" blurDataURL="automatic" />
                  <br />
                  <button type="button" className="btn btn-warning m-2" onClick={() => { goToPlayground(true) }}><i className="bi bi-hand-index-fill me-1"></i> No background</button>
                </div>
              </div>
            </div>
            :
            // Remove background prompt
            <div className="text-center">
              <p className="text-body-tertiary fst-italic">This feature is <strong>experimental</strong> and might not work on all devices and browsers</p>
              <h5><strong>Remove background?</strong></h5>
              <p>
                Would you like to remove the background from the photo before editing?
                <br />
                Don&apos;t worry we&apos;ll handle it automatically.
              </p>
              <Image className="img-fluid rounded w-25" src={bgRemovedImageURL} alt="BG removed photo" width={400} height={600} placeholder="blur" blurDataURL="automatic" />
              <br />
              <button type="button" className="btn btn-secondary m-2" onClick={() => { goToPlayground() }}>Nah <i className="bi bi-hand-thumbs-down-fill ms-1"></i></button>
              <button type="button" className="btn btn-warning m-2" onClick={removeBG}>Sure <i className="bi bi-hand-thumbs-up-fill ms-1"></i></button>
            </div>
        }
      </div>
    )
  };

  //#endregion

  //#region The edit playground

  // Pick up where the user left off (e.g. after an accidental refresh)
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const restoreDraft = async () => {
      try {
        const draft = await loadDraft();
        if (cancelled) return;
        if (draft) {
          setBaseImageURL(URL.createObjectURL(draft.baseImage));
          setDraftState(draft.state);
          setEditState("playground");
          return;
        }
      } catch (error) {
        console.error("Could not restore draft", error);
      }
      if (!cancelled) setEditState("upload");
    };
    restoreDraft();
    return () => { cancelled = true; }
  }, []);

  const startOver = async () => {
    try {
      await clearDraft();
    } catch (error) {
      console.error("Could not clear draft", error);
    }
    setDraftState(null);
    setBaseImageFile(null);
    setBaseImageURL("/images/placeholder.png");
    setBgRemovedImageURL("/images/placeholder.png");
    setBgRemovalDone(false);
    setEditState("upload");
  };

  const playgroundDisplay = () => {
    return <Playground baseImageURL={baseImageURL} initialState={draftState} onStartOver={startOver} />
  };

  //#endregion

  const editDisplay = () => {
    switch (editState) {
      case "upload":
        return uploadDisplay();

      case "remove-bg":
        return removeBGDisplay();

      case "playground":
        return playgroundDisplay();

      default:
        return <></>;
    }
  };

  return (
    <div>
      <DefaultHead />
      <NavBar currentPage="edit" />
      <br />

      {editDisplay()}
    </div>
  )
};

export default Edit;