import "./styles/site.css";
import { mountAccount } from "./features/account/account";
import { mountModuleOptimizer } from "./features/module-optimizer/module-optimizer";
import { mountProfileLab } from "./features/profile-lab/profile-lab";
import { mountParseBrowser } from "./features/parse-browser/parse-browser";

void mountAccount();
void mountProfileLab();
void mountModuleOptimizer();
void mountParseBrowser();
