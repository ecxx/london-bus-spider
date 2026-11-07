// The content of the panel for the current view: the header, then the body of the view.
// The route body comes in step 11 of prod_design 9.
import { useContext, useLayoutEffect } from "preact/hooks";
import type { Core } from "../data/load";
import { viewHash, type View } from "../model/url";
import { spider } from "../state/spider";
import { AboutView } from "./AboutView";
import { ViewHeader } from "./headers";
import { HomeView } from "./HomeView";
import { ScrollContext } from "./scroll";
import { SpiderView } from "./SpiderView";

export function ViewContent({ d, view }: { d: Core; view: View }) {
  const scroll = useContext(ScrollContext);
  const hash = viewHash(view);
  // A new view starts at the top. The home view puts back the scroll position of its tab.
  useLayoutEffect(() => {
    if (view.kind !== "home" && scroll.current) scroll.current.scrollTop = 0;
  }, [hash]);
  if (view.kind === "home") return <HomeView d={d} />;
  const s = spider.value;
  return (
    <>
      <ViewHeader d={d} view={view} />
      {s && <SpiderView d={d} s={s} />}
      {view.kind === "about" && <AboutView d={d} />}
    </>
  );
}
