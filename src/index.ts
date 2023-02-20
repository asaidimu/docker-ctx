import { getPluginConfiguration } from "@yarnpkg/cli";
import { Configuration, Project, Workspace, } from "@yarnpkg/core";
import { globby, Options } from "globby";
import { basename, dirname, join, relative, resolve } from "path";
import fs from 'fs/promises'
import os from "os";
import args from "./args.js"
import { promisify } from 'util'
/* @ts-ignore */
import { pipe as rawPipe } from 'mississippi'
/* @ts-ignore */
import { create as createTar } from 'tar'

const pipe = promisify(rawPipe)

interface WorkspaceData {
    name:string,
    path: string,
    dependencies: Array<WorkspaceData>
}

interface WorkspaceContext {
    cwd: string,
    meta:Array<string>
    deps:Array<string>
    pkg:Array<string>
}

async function getWorkspaceData({ dir }:{dir:string}):Promise<Array<WorkspaceData>|null> {
    const configuration = await Configuration.find(
        dir as any,
        getPluginConfiguration()
    );
    const project = await Project.find(configuration, dir as any);

    const mapper = (workspace:Workspace):WorkspaceData => {
        const name = () => {
            const { name, scope } = workspace.locator;
            if (scope === null) {
                return name;
            }
            return `@${scope}/${name}`; };

        const dependencies = () => {
            const dependencies = workspace.getRecursiveWorkspaceDependencies();
            return Array.from(dependencies).map(mapper);
        };

        return {
            name: name(),
            path: workspace.cwd,
            dependencies: dependencies(),
        };
    };

    if(! project.workspace) {
        return null
    } else {
        return project.workspace.getRecursiveWorkspaceChildren().map(mapper);
    }
};

async function createWorkspaceContext ({ path, dependencies }: WorkspaceData):Promise<WorkspaceContext> {
    const glob = async (patterns: string | Array<string>, options: Options):Promise<Array<string>> => {
        return globby(patterns, Object.assign({
        gitignore:true,
        dot: true,
        absolute: true
        }, options))
    }
    const getMetaFiles = async ({ cwd}:{cwd:string}) => {
        return glob(["package.json", ".yarnrc.yml", ".yarn/**", "yarn.lock", "tsconfig.json"], {
        cwd,
    })}

    const getPackageFiles =  async (patterns: string | Array<string>, options: Options):Promise<Array<string>> => {
        return glob(["**",...patterns], options)
    }

    const meta = (await Promise.all([
       getMetaFiles({cwd: path}),
       getMetaFiles({cwd:process.cwd()}),
      ...(dependencies.map(({path})=> getMetaFiles({cwd:path})).flat())
    ])).flat()

    const pkg = await getPackageFiles(["!dockerfile", "!Dockerfile"], { cwd:path, })
    const deps = await Promise.all(dependencies.map(({path})=> getPackageFiles([], {cwd:path}) ))
    const result = Object.entries({ meta, deps:deps.flat(), pkg}).map(
        ([key, values]) => {
            return [key, values.map(file =>relative(process.cwd(), file))]
        })

    return Object.fromEntries(result)
}
const withTmpDir =  async (callback:(dir:string) => Promise<any|null>)=> {
    const tmpdir = await fs.mkdtemp(join(os.tmpdir(), basename(process.cwd())))
    let result = null
    try {
        result = await callback(tmpdir)
    } finally {
        await fs.rm(tmpdir, {recursive: true})
    }
    return result
}

async function getFiles (dir:string) {
  async function * yieldFiles (dirPath:string):AsyncGenerator<string> {
    const paths = await fs.readdir(dirPath, { withFileTypes: true })
    for (const path of paths) {
      const res = resolve(dirPath, path.name)
      if (path.isDirectory()) {
        yield * yieldFiles(res)
      } else {
        yield res
      }
    }
  }

  const files = []
  for await (const f of yieldFiles(dir)) {
    files.push(relative(dir, f))
  }
  return files
}

async function fileExists (path:string) {
  try {
    await fs.stat(path)
  } catch (err) {
    return false
  }
  return true
}


async function copyFiles (files:Array<string>, dstDir:string) {
  return Promise.all(
    files.map(async f => {
      const dst = join(dstDir, f)
      await fs.mkdir(dirname(dst), { recursive: true })
      return fs.copyFile(f, dst)
    })
  )
}

export const main = async () => {
    const { package:pkg, config, list } = args() as any
    const data = await getWorkspaceData({dir: process.cwd()});
    if(!data || !pkg || !config) {
        console.warn("Nothing to do!")
        return
    }

    if(! await fileExists(config)) {
        console.warn("Docker file not found")
        return
    }

    const ctx = await createWorkspaceContext(
        data.find(i => i.name == pkg)!
    )

    await withTmpDir(async (tmpdir: string) => {
        await Promise.all([
            fs.copyFile(config, join(tmpdir, 'Dockerfile')),
            ...(Object.entries(ctx).map(
                ([target, files]) => copyFiles(files, join(tmpdir, target))
            ))
        ])

        const files = await getFiles(tmpdir)
        if(list) {
            for(const f of files) console.log(f)
        } else {
            await pipe(createTar({ gzip: true, cwd: tmpdir }, files), process.stdout)
        }
    })


};

export default main
