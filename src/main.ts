import "./styles/site.css";
import { mountModalViewport } from "./modal-viewport";
import { mountSiteNavigation } from "./site-navigation";

mountModalViewport();
const page = mountSiteNavigation();

if (page === "home") {
  void import("./features/home/home").then(({ mountHome }) => mountHome());
}

if (page === "account") {
  void import("./features/account/account").then(({ mountAccount }) => mountAccount("profile"));
}
if (page === "my-account") {
  void import("./features/account/account").then(({ mountAccount }) => mountAccount("settings"));
}
if (page === "profiles") {
  void import("./features/profiles/profile-browser").then(({ mountProfileBrowser }) =>
    mountProfileBrowser(),
  );
}
if (page === "users") {
  void import("./features/profiles/public-account").then(({ mountPublicAccount }) =>
    mountPublicAccount(),
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
if (page === "my-parses") {
  void import("./features/my-parses/my-parses").then(({ mountMyParses }) =>
    mountMyParses(),
  );
}
