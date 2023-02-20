import yargs from 'yargs';
export const readArguments = () => {
    const args = {
        files: {
            type: 'array',
            alias: 'f',
            describe: 'extra files to include',
        },
        package: {
            type: 'string',
            alias: 'p',
            describe: 'workspace package name'
        },
        config: {
            type: 'string',
            alias: 'c',
            describe: 'Dockerfile'
        },
        "list": {
            type: 'boolean',
            alias:'l',
            describe: 'list files instead of creating tar'

        }
    }

    const usage = 'Usage:\n  context [opts..]';
    return (yargs(process.argv.slice(2))
        .options(args as any)
        .usage(usage)
        .alias('h', 'help')
        .argv);
}

export default readArguments
