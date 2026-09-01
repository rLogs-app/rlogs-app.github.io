import "./styles/site.css";
import { mountSiteNavigation } from "./site-navigation";

const page = mountSiteNavigation();

if (page === "home") {
  void import("./features/home/home").then(({ mountHome }) => mountHome());
}

if (page === "account") {
  void import("./features/account/account").then(({ mountAccount }) => mountAccount());
}
if (page === "profiles") {
  void import("./features/profiles/profile-browser").then(({ mountProfileBrowser }) =>
    mountProfileBrowser(),
  );
}
if (page === "optimizer") {
  void import("./features/module-optimizer/module-optimizer").then(({ mountModuleOptimizer }) =>
    mountModuleOptimizer(),
  );
}
if (page === "parses") {
  void import("./features/parse-browser/parse-browser").then(({ mountParseBrowser }) =>
    mountParseBrowser(),
  );
}
