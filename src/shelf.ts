import path from 'path';
import type { OptionDefinition } from 'command-line-usage';
import commandLineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage';
import { makeSelfExtractingScript } from 'make-self-extracting';
import fs from 'fs';
import fsp from 'fs/promises';

const optionDefinitions: OptionDefinition[] = [
  {
    name: 'type',
    alias: 't',
    type: String,
    description: 'The type of archive to create. Must be tar or zip',
    typeLabel: '<zip|tar>',
    defaultValue: 'tar'
  },
  {
    name: 'compress-level',
    alias: 'c',
    type: Number,
    description: 'The compression level. A value of zero disables compression',
    typeLabel: '<0-9>'
  },
  {
    name: 'pre-extract',
    alias: 'a',
    type: String,
    description: 'Script contents to run prior to extracting the embedded archive'
  },
  {
    name: 'post-extract',
    alias: 'b',
    type: String,
    description: 'Script contents to run after extracting the embedded archive'
  },
  {
    name: 'pre-extract-file',
    alias: 'n',
    type: String,
    description: 'Script file to run prior to extracting the embedded archive. Overrides --pre-extract',
    typeLabel: '<file>'
  },
  {
    name: 'post-extract-file',
    alias: 'm',
    type: String,
    description: 'Script file to run after extracting the embedded archive. Overrides --post-extract',
    typeLabel: '<file>'
  },
  {
    name: 'omit-header',
    alias: 'q',
    type: Boolean,
    description: "If the 'created with...' notice should be omitted. I don't mind"
  },
  {
    name: 'root',
    alias: 'r',
    type: String,
    description:
      'The root path for entries in the archive. Files will have this leading path stripped. ' +
      'If omitted all files will added to the root',
    typeLabel: '<path>'
  },
  {
    name: 'files',
    alias: 'f',
    type: String,
    multiple: true,
    defaultOption: true,
    defaultValue: [],
    description: 'List of files to embed in the script',
    typeLabel: '<files>'
  },
  {
    name: 'output',
    alias: 'o',
    type: String,
    description: 'File to write output to. If omitted, output is written to standard out',
    typeLabel: '<file>'
  },
  { name: 'help', alias: 'h', type: Boolean, description: 'Shows this help', defaultValue: false }
];

// An aide-mémoire to avoid loosely typing the arguments
type OptionsType = {
  type: string;
  ['compress-level']?: number;
  ['pre-extract']?: string;
  ['post-extract']?: string;
  ['pre-extract-file']?: string;
  ['post-extract-file']?: string;
  ['omit-header']?: boolean;
  files: string[];
  root?: string;
  output?: string;
  help: boolean;
};

const options = commandLineArgs(optionDefinitions) as OptionsType;

// Show help
if (options.help) {
  const usage = commandLineUsage([
    { header: 'make-self-extracting-bin', content: 'A tool for creating self extracting shell scripts' },
    { header: 'Options', optionList: optionDefinitions },
    {
      header: 'Example usage',
      content: [
        '  npx make-self-extracting-bin \\',
        '      --pre-extract "echo Hello" \\',
        '      --post-extract "echo World; cat README.md" \\',
        '      --output example.sh \\',
        '      README.md'
      ],
      raw: true
    }
  ]);
  console.log(usage);

  process.exit(0);
}

// Create the self extracting archive
(async () => {
  // Hand cranked validation
  if (options.files.length === 0) {
    console.error('No files to embed specified');
    process.exit(1);
  }

  if (
    options['post-extract'] === undefined ||
    (options['post-extract'].length === 0 && options['post-extract-file'] === undefined)
  ) {
    console.error('No post extraction script specified');
    process.exit(1);
  }

  function validateArchiveType(value: string | undefined): asserts value is 'tar' | 'zip' {
    const validArchiveTypes = ['tar', 'zip'];
    if (!validArchiveTypes.some((p) => p === options.type)) {
      console.error('Invalid archive type. Values tar or zip allowed');
      process.exit(1);
    }
  }
  validateArchiveType(options.type);

  type ValidCompressLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  const validCompressLevels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  function validateCompressLevel(value: number | undefined): asserts value is ValidCompressLevel {
    if (value !== undefined && !validCompressLevels.some((p) => p === value)) {
      console.error('Invalid compression level. Values 0-9 allowed');
      process.exit(1);
    }
  }

  // Note: Type narrowed slightly incorrectly to 0-9, instead of 0-9|undefined. This is
  // because if undefined is part of the type, it is always deduced as undefined
  validateCompressLevel(options['compress-level']);

  // Read the pre/post-extraction scripts
  if (options['pre-extract-file'] !== undefined) {
    try {
      const preExtract = await (await fsp.readFile(options['pre-extract-file'])).toString();
      options['pre-extract'] = preExtract;
    } catch (err) {
      console.error(`Failed to read pre-extraction script '${options['pre-extract-file']}'`);
      process.exit(1);
    }
  }

  if (options['post-extract-file'] !== undefined) {
    try {
      const postExtract = await (await fsp.readFile(options['post-extract-file'])).toString();
      options['post-extract'] = postExtract;
    } catch (err) {
      console.error(`Failed to read post-extraction script '${options['post-extract-file']}'`);
      process.exit(1);
    }
  }

  const resolvedRoot = options.root !== undefined ? path.resolve(options.root) : undefined;

  // Build the list of files to embed. Automatically mark shell scripts as executable
  const files = options.files.map((p) => {
    const parsedPath = path.parse(p);
    const mode = parsedPath.ext === '.sh' ? 0o755 : 0o644;
    const filename = resolvedRoot !== undefined ? path.relative(resolvedRoot, p) : parsedPath.base;

    return {
      filename,
      path: path.resolve(p),
      mode
    };
  });

  // Warn if any duplicate files will be created
  const entryCount = new Map<string, string[]>();
  files.forEach((p) => {
    entryCount.set(p.filename, [...(entryCount.get(p.filename) ?? []), p.path]);
  });

  if (entryCount.size != files.length) {
    console.error('Archive contains duplicate files');

    for (const entry of entryCount) {
      if (entry[1].length !== 1) {
        console.error(`Archive would contain path ${entry[0]} ${entry[1].length} times`);
        for (const source of entry[1]) {
          console.error(`  From ${source}`);
        }
      }
    }

    process.exit(1);
  }

  // Default to output to standard out
  const outputStream = options.output === undefined ? process.stdout : fs.createWriteStream(options.output);

  try {
    await makeSelfExtractingScript(
      {
        archiveFormat: options.type,
        compressionLevel: options['compress-level'],
        omitLibraryHeader: options['omit-header'],
        preExtraction: options['pre-extract'],
        postExtraction: options['post-extract']
      },
      files,
      outputStream
    );
  } catch (err) {
    process.exit(1);
  }
})();
