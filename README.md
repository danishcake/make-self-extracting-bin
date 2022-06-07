# make-self-extracting-bin

A command-line tool for creating self-extracting shell-scripts.

Github: https://github.com/danishcake/make-self-extracting-bin \
NPM: https://www.npmjs.com/package/make-self-extracting-bin

Based on https://www.npmjs.com/package/make-self-extracting

## Usage

Via `npx`

```Bash
npx make-self-extracting-bin \
  --pre-extract "echo Extracting..." \
  --post-extract "echo Installing...; ./prepare.sh; ./install.sh; ./cleanup.sh" \
  --output ./install.sh \
  ./prepare.sh ./install.sh ./cleanup.sh
```

Via globally installed script

```Bash
# Run once, ahead of time
npm install -g make-self-extracting-bin

make-self-extracting-bin \
  --pre-extract "echo Extracting..." \
  --post-extract "echo Installing...; ./prepare.sh; ./install.sh; ./cleanup.sh" \
  --output ./install.sh \
  ./prepare.sh ./install.sh ./cleanup.sh
```

## How it works

The files specified when building the script are added to an archive (usually a .tar.gz). This archive, the pre-extraction, post-extraction and a small amount of fixed plumbing are concatenated into a single script file, that when run:

1. Runs the pre-extract script
2. Extracts the embedded archive to a temporary directory
3. Runs the post-extract script, changing CWD to the temporary directory.
4. Deletes the temporary directory

## Options

| Option                         | Description                                                                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| -t, --type <zip\|tar>          | The type of archive to create. Must be tar or zip. Defaults to tar, and generally safe to leave as this value                                  |
| -c, --compress-level <0-9>     | The compression level. A value of zero disables compression                                                                                    |
| -a, --pre-extract string       | Script contents to run prior to extracting the embedded archive. Multiple commands can be separated by semi-colons                             |
| -b, --post-extract string      | Script contents to run after extracting the embedded archive. Multiple commands can be separated by semi-colons                                |
| -n, --pre-extract-file <file>  | Script file to run prior to extracting the embedded archive. Overrides --pre-extract. This can be used to embed more significant shell scripts |
| -m, --post-extract-file <file> | Script file to run after extracting the embedded archive. Overrides --post-extract                                                             |
| -q, --omit-header              | If the 'created with...' notice should be omitted. I don't mind                                                                                |
| -r, --root <path>              | The root path for entries in the archive. Files will have this leading path stripped. If omitted all files will added to the root              |
| -f, --files <files>            | List of files to embed in the script. This is the default option, so -f does not need to be specified                                          |
| -o, --output <file>            | File to write output to. If omitted, output is written to standard out                                                                         |
