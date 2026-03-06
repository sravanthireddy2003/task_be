const fs = require('fs');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

const deps = {};
const devDeps = {};

if (lock.packages && lock.packages['']) {
    Object.assign(deps, lock.packages[''].dependencies || {});
    Object.assign(devDeps, lock.packages[''].devDependencies || {});
} else if (lock.dependencies) {
    for (const [name, info] of Object.entries(lock.dependencies)) {
        if (!info.dev) {
            deps[name] = info.version || "*";
        } else {
            devDeps[name] = info.version || "*";
        }
    }
} else {
    // For V3 where there's no '' but packages are listed. Root deps are indicated by top-level "requires" or we just infer.
    // Let's just grab direct dependencies by comparing node_modules/* 
    if (lock.packages) {
        for (const [key, val] of Object.entries(lock.packages)) {
            if (key.startsWith('node_modules/')) {
                const pkgName = key.replace('node_modules/', '');
                // skip nested dependencies like node_modules/a/node_modules/b
                if (!pkgName.includes('node_modules/')) {
                    if (val.dev) {
                        devDeps[pkgName] = "^" + val.version;
                    } else {
                        deps[pkgName] = "^" + val.version;
                    }
                }
            }
        }
    }
}

const pkg = {
    name: lock.name || "Taskmgr-Be_V4",
    version: lock.version || "1.0.0",
    main: "index.js",
    scripts: {
        "start": "node index.js",
        "dev": "nodemon index.js"
    },
    dependencies: deps,
    devDependencies: devDeps
};

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
console.log("Reconstructed package.json successfully.");
