import { readdirSync, readFileSync, existsSync } from "fs";
import { normalize, dirname } from "path";

export default class Project {
  #path;
  #includePattern;
  #excludePattern;
  #aliasMapping;
  #fileList;

  constructor(path, { includePattern, excludePattern, aliasMapping = {} }) {
    this.#path = path;
    this.#includePattern = includePattern;
    this.#excludePattern = excludePattern;
    this.#aliasMapping = aliasMapping;
    this.#fileList = this.#getFileList(this.#path);
  }

  #getFileList(path) {
    const getSourceFiles = (files) =>
      files
        .filter((file) => file.isFile())
        .filter((file) => file.name.match(this.#includePattern))
        .filter((file) => !file.name.match(this.#excludePattern));

    const getDirectories = (files) => files.filter((file) => file.isDirectory());

    const files = readdirSync(path, { withFileTypes: true });
    const fileList = getSourceFiles(files).map((file) => normalize(`${path}/${file.name}`));
    getDirectories(files)
      .map((subDir) => this.#getFileList(`${path}/${subDir.name}`))
      .map((dirFiles) => dirFiles.forEach((file) => fileList.push(file)));

    return [...fileList];
  }

  #getImport(file, { ignoreNodeModules = false }) {
    const content = readFileSync(file, { encoding: "UTF-8" }).replace(/[\r\n]/gi, " ");
    const nodes = (content.match(/import\s+.*?\s+from\s+.*?;/gim) || []).map((nodeText) =>
      this.#parseImportByFromSyntax(nodeText, file)
    );
    // Lazy loading of modules in an Angular project
    const inlineImports = (content.match(/import\((.*?)\).then\([^\(]*=>[^\)]*\)/gim) || []).map((nodeText) =>
      this.#parseImportByInlineSyntax(nodeText, file)
    );
    return nodes
      .concat(inlineImports)
      .map((imp) => ({ ...imp, path: this.#clearPath(imp.path) }))
      .filter((imp) => (ignoreNodeModules ? imp.path[0] === "/" : true));
  }

  #parseImportByFromSyntax(nodeText, file) {
    const data = nodeText.match(/import\b(.*?)\bfrom\b['" ]*(.*?)['" ]*;/);
    return {
      elements: data[1]
        .replace(/[\{\}]/g, "")
        .split(/,/)
        .map((v) => v.trim()),
      path: this.#normalizeImportPath(data[2], file),
    };
  }

  #parseImportByInlineSyntax(nodeText, file) {
    const data = nodeText.match(/import\(['" ](.*?)['" ]\).then\([^\(]*=>.*\.([^\)]*)\)/);
    return {
      elements: [data[2].trim()],
      path: this.#normalizeImportPath(data[1], file),
    };
  }

  #normalizeImportPath(path, origin) {
    const currentDir = dirname(origin);
    const resolved = this.#resolveAlias(path);
    let absolutePath;
    if (path !== resolved) {
      absolutePath = normalize(`${this.#path}/${resolved}`);
    } else {
      absolutePath = normalize(`${currentDir}/${path}`);
    }
    if (!(existsSync(absolutePath) || existsSync(absolutePath + ".ts"))) {
      absolutePath = path;
    }
    return absolutePath;
  }

  #resolveAlias(path) {
    const foundPattern = Object.keys(this.#aliasMapping)
      .map((alias) => {
        const regex = new RegExp(`^${alias}`);
        if (regex.test(path)) {
          return { regex, replacement: this.#aliasMapping[alias] };
        }
      })
      .filter(Boolean);
    return foundPattern.length > 0 ? path.replace(foundPattern[0].regex, foundPattern[0].replacement) : path;
  }

  #clearPath(path) {
    return path.replace(/\.ts$/, "").replace(new RegExp(this.#path), "");
  }

  #toEdges(pathList) {
    const edges = [];
    pathList.forEach(({ file, imports }) => {
      imports.forEach(({ path, elements }) => {
        let isDuplicated = false;
        if (edges.some((e) => e.from === file && e.to === path)) {
          isDuplicated = true;
        }
        edges.push({ from: file, to: path, elements, isDuplicated });
      });
    });
    return Object.create(Object.prototype, {
      getValue: {
        value: () => edges,
      },
      getDuplicatedEdges: {
        value: () => edges.filter((edge) => edge.isDuplicated),
      },
      getCircularDependencyTree: {
        value: this.#findCircularDependencies.bind(this, edges),
      },
    });
  }

  #findCircularDependencies(edges) {
    const addDependencyToFlow = (edge, flow = []) => {
      flow.push(edge);
      const toEdges = edges.filter((e) => e.from === edge.to);
      toEdges.forEach((toEdge) => {
        if (flow.map((e) => e.to).indexOf(toEdge.to) === -1) {
          addDependencyToFlow(toEdge, flow);
        }
      });
      return flow;
    };

    const edgesWithDependencyFlow = [];
    edges.forEach((edge) => {
      edgesWithDependencyFlow.push({
        file: edge.from,
        dependencyFlow: addDependencyToFlow(edge),
      });
    });

    const addDependencyToTree = (edge, flow, tree = []) => {
      flow.forEach((_edge) => {
        tree.unshift(_edge.to);
        if (_edge.from === edge.file) {
          tree.unshift(_edge.from);
          return;
        }
        const prevEdges = edge.dependencyFlow.filter((dep) => dep.to === _edge.from);
        addDependencyToTree(edge, prevEdges, tree);
      });
      return tree;
    };

    const circularDependencies = edgesWithDependencyFlow
      .map((edge) => ({ ...edge, dependencyFlowFiltered: edge.dependencyFlow.filter((dep) => dep.to === edge.file) }))
      .filter((edge) => edge.dependencyFlowFiltered.length)
      .map((edge) => ({ file: edge.file, tree: addDependencyToTree(edge, edge.dependencyFlowFiltered) }));

    return circularDependencies;
  }

  getImports({ ignoreNoImports = false, ignoreNodeModules = false }) {
    const imports = this.#fileList
      .map((file) => ({
        file: this.#clearPath(file),
        imports: this.#getImport(file, { ignoreNodeModules }),
      }))
      .filter((list) => (ignoreNoImports ? list.imports.length : true));
    return {
      toEdges: this.#toEdges.bind(this, imports),
    };
  }
}
