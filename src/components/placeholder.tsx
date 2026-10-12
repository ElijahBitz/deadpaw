import Image from "next/image";

const Placeholder = () => {
  return (
    <div>
      <h2><strong>Coming soon!</strong></h2>
        <p>McGinnis is working on it</p>
        <br />
        <Image className="img-fluid w-50" src="/images/deadlock/items/mcginnis/card.png" alt="Working McGinnis" width={280} height={380} loading="eager" />
    </div>
  )
};

export default Placeholder;
