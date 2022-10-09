import { readFileSync } from "fs";

export function getTsConfigAliasMapping(tsConfigPath) {
  const mapping = {};
  let tsconfig = {};

  try {
    tsconfig = JSON.parse(readFileSync(tsConfigPath, { encoding: "UTF-8" }));
  } catch (error) {
    console.warn("tsconfig failed to load: ", error);
    return mapping;
  }

  const paths = (tsconfig && tsconfig.compilerOptions && tsconfig.compilerOptions.paths) || [];

  Object.keys(paths).map((alias) => {
    const pattern = alias.replace(/\*$/, "");
    const replacement = paths[alias];
    mapping[pattern] = replacement[0].replace(/\*$/, "");
  });

  return mapping;
}
