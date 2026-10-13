import Link from "next/link";
import Image from "next/image";
import NavBar from "@/components/navbar";
import Header from "@/components/header";
import DefaultHead from "@/components/default-head";
import { useEffect, useState } from "react";
import { randomIntArray } from "@/helper";

interface HeroPreview {
  id: string,
  name: string,
  extra?: boolean
}

const Home = () => {
  // Load a few random hero portraits as a preview
  const [previewHeroes, setPreviewHeroes] = useState<HeroPreview[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const fetchHeroData = async () => {
      try {
        const response = await fetch("/data/deadlock/heroes.json", { signal: controller.signal });
        const data = (await response.json() as HeroPreview[]).filter((hero) => !hero.extra);
        const previewCount = Math.min(4, data.length);
        setPreviewHeroes(randomIntArray(previewCount, 0, data.length - 1).map((index) => data[index]));
      } catch { }
    };
    fetchHeroData();
    return () => { controller.abort(); }
  }, []);

  return (
    <div>
      <DefaultHead />
      <NavBar currentPage="home" />
      <br />

      <div className="container text-center">
        <Header />
        <hr />

        <p>Pick from heroes like:</p>
        <div className="row">
          {
            previewHeroes.map((hero) => {
              return (
                <div className="col" key={`preview${hero.id}`}>
                  <Image
                    className="img-fluid rounded border bg-body-secondary"
                    src={`/images/deadlock/items/${hero.id}/card.png`}
                    alt={hero.name}
                    width={280}
                    height={380} />
                  <p><strong>{hero.name}</strong></p>
                </div>
              )
            })
          }
        </div>
        <hr />

        <p>I&apos;ve seen enough, let&apos;s
          <span><Link type="button" className="btn btn-warning ms-2" href="/edit">Edit <i className="bi bi-pencil-fill ms-1"></i></Link></span>
        </p>

        <p className="text-body-tertiary fst-italic">
          This is an unofficial, fan-made project inspired by the game <strong>Deadlock</strong>.
          <br />
          <strong>Deadlock</strong> and all related names, characters, and assets are trademarks of <strong>Valve Corporation</strong>.

          <br />
          <br />

          Forked from <a href="https://github.com/ThaiDuongVu/pawverwatch" className="text-info text-decoration-none">pawverwatch</a>.
          If you like what you see, consider <a href="https://ko-fi.com/wingnight" className="text-info text-decoration-none">supporting its original developer</a>.

          <br />
          <br />

          Deadpaw is made by <a href="https://github.com/ElijahBitz" className="text-info text-decoration-none">ElijahBitz</a> (<a href="https://killyourjockey.de" className="text-info text-decoration-none">killyourjockey.de</a>).
          Any issues should be reported on <a href="https://github.com/ElijahBitz/deadpaw/issues" className="text-info text-decoration-none">GitHub</a>.
        </p>
      </div>
    </div>
  );
}

export default Home;
