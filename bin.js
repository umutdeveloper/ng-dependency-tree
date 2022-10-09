import config from "./config.json" assert { type: "json" };
import AngularProject from "./domain/angular-project.js";
import { getTsConfigAliasMapping } from "./utils.js";

const { projectSourceDir, includePattern, excludePattern, tsConfigPath } = config;
const aliasMapping = getTsConfigAliasMapping(tsConfigPath);
const angularProject = new AngularProject(`${projectSourceDir}`, {
  includePattern,
  excludePattern,
  aliasMapping,
});

const imports = angularProject.getImports({ ignoreNoImports: true, ignoreNodeModules: true });
const edges = imports.toEdges();
const duplicatedEdges = edges.getDuplicatedEdges();
const circularDependencies = edges.getCircularDependencyTree();

console.log(`You have ${edges.length} edges between your files.`);
if (duplicatedEdges.length > 0) {
    console.log('');
    console.log(`!!WARNING!! You have ${duplicatedEdges.length} duplicated imports in your files:`);
    duplicatedEdges.forEach((edge, index) => {
        console.log(`${index+1}. Importing "{ ${edge.elements.join(',')} }" from "${edge.to}" in "${edge.from}" file.`);
    });
    console.log('');
}

if (circularDependencies.length > 0) {
    console.log('');
    console.log(`!!WARNING!! You have ${circularDependencies.length} circular deps. in your project:`);
    circularDependencies.forEach((edge, index) => {
        console.log('');
        console.log(`${index+1}. Imported in "${edge.file}" file; \n${edge.tree.join('\n')}`);
        console.log('============================');
    });
    console.log('');
}