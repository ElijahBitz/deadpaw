import Image from "next/image";
import { ReactElement } from "react";

interface MapModaProps {
  name: string,
  id: string,
  icon: string,
  maps: string[],
  // Optional caption per map, same order as maps
  labels?: string[],
  onMapClicked: (map: string) => void
}

const MapModal = ({ name, id, icon, maps, labels, onMapClicked }: MapModaProps) => {
  const mapButton = (map: string, label?: string) => {
    if (!map || map === "") return <div></div>
    return (
      <button type="button" className="btn btn-secondary shadow-lg m-1" title={label ?? `${name} background`} onClick={() => onMapClicked(map)}>
        <Image className="img-fluid" src={map} alt={label ?? `${name} item`} width={400} height={400} loading="lazy" />
        {label ? <div className="mt-1"><strong>{label}</strong></div> : <></>}
      </button>
    );
  }

  const mapGrid = () => {
    let rows: ReactElement[] = [];
    for (let i = 0; i < maps.length; i += 2) {
      const map1 = maps[i];
      const map2 = maps[i + 1];
      rows = [...rows,
      <div className="row" key={`itemRow${i}`}>
        <div className="col-6">{mapButton(map1, labels?.[i])}</div>
        <div className="col-6">{mapButton(map2, labels?.[i + 1])}</div>
      </div>
      ]
    }
    return rows;
  }

  return (
    <div className="modal fade" id={id} tabIndex={-1} aria-labelledby={`${id}ModalLabel`}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header bg-body-tertiary">
            <h5 className="modal-title" id={`${id}ModalLabel`}><strong>{name} backgrounds</strong></h5>
            <Image className="img-fluid rounded ms-2" src={icon} alt={`${name} modal`} width={30} height={30} />
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div className="modal-body">
            {mapGrid()}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-warning" data-bs-dismiss="modal">Done <i className="bi bi-check-circle-fill ms-1"></i></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapModal;