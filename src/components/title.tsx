import { getCookie } from "@/cookieManager";
import { useEffect, useRef, useState } from "react";

const Title = () => {
  const [theme, setTheme] = useState("light");
  const themeSet = useRef(false);
  useEffect(() => {
    if (!themeSet.current) setTheme(getCookie("theme") ?? "light");
    return () => { themeSet.current = true; }
  }, [])
  return <strong>
    <span className={theme === "dark" ? "title-white" : "title-grey"}>Dead</span>
    <span className="title-orange">paw</span>
  </strong>
};

export default Title;
