/* eslint-disable no-console */
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';

import configuredEventIndexerSchema from '../../config/schemas/configuredEventIndexer.schema.json';
import type { ConfiguredEventIndexer, EventIndexerConfig } from '../../src/libs/eventIndexer/types';
import { decodeBase64ToJson } from './../utils/decodeBase64ToJson';
import { formatSourceFile } from './../utils/formatSourceFile';
import { PluginLogger } from './../utils/PluginLogger';
import { validateJsonAgainstSchema } from './../utils/validateJson';

dotenv.config();

const pluginName = 'generateEventIndexerConfig';
const logger = new PluginLogger(pluginName);

const skip = process.env.SKIP_ENV_VALDIATION === 'true';

const currentDir = path.resolve(new URL(import.meta.url).pathname);

const outputPath = path.join(path.dirname(currentDir), '../../src/generated/eventIndexerConfig.ts');

export function generateEventIndexerConfig() {
  return {
    name: pluginName,
    async buildStart() {
      logger.info('Plugin initialized.');
      let configuredEventIndexerConfigFile;

      if (skip) {
        configuredEventIndexerConfigFile = '';
      } else {
        if (!process.env.CONFIGURED_EVENT_INDEXER) {
          throw new Error(
            'CONFIGURED_EVENT_INDEXER is not defined in environment. Make sure to run the export step in the documentation.',
          );
        }

        // Decode base64 encoded JSON string
        configuredEventIndexerConfigFile = decodeBase64ToJson(process.env.CONFIGURED_EVENT_INDEXER || '');

        // Valide JSON against schema
        const isValid = validateJsonAgainstSchema(configuredEventIndexerConfigFile, configuredEventIndexerSchema);
        if (!isValid) {
          throw new Error('encoded configuredEventIndexer.json is not valid.');
        }
      }
      // Path to where you want to save the generated Typ eScript file
      const tsFilePath = path.resolve(outputPath);

      const project = new Project();
      const notification = `// Generated by ${pluginName} on ${new Date().toLocaleString()}`;
      const warning = `// WARNING: Do not change this file manually as it will be overwritten`;

      let sourceFile = project.createSourceFile(tsFilePath, `${notification}\n${warning}\n`, { overwrite: true });

      // Create the TypeScript content
      sourceFile = await storeTypesAndEnums(sourceFile);
      sourceFile = await buildEventIndexerConfig(sourceFile, configuredEventIndexerConfigFile);

      await sourceFile.save();

      const formatted = await formatSourceFile(tsFilePath);
      console.log('formatted', tsFilePath);

      // Write the formatted code back to the file
      await fs.writeFile(tsFilePath, formatted);
      logger.info(`Formatted config file saved to ${tsFilePath}`);
    },
  };
}

async function storeTypesAndEnums(sourceFile: SourceFile) {
  logger.info(`Storing types...`);
  // RelayerConfig
  sourceFile.addImportDeclaration({
    namedImports: ['EventIndexerConfig'],
    moduleSpecifier: '$libs/eventIndexer',
    isTypeOnly: true,
  });

  logger.info('Types stored.');
  return sourceFile;
}

async function buildEventIndexerConfig(
  sourceFile: SourceFile,
  configuredEventIndexerConfigFile: ConfiguredEventIndexer,
) {
  logger.info('Building event indexer config...');

  const indexer: ConfiguredEventIndexer = configuredEventIndexerConfigFile;

  if (!skip) {
    if (!indexer.configuredEventIndexer || !Array.isArray(indexer.configuredEventIndexer)) {
      console.error(
        'configuredEventIndexer is not an array. Please check the content of the configuredEventIndexerConfigFile.',
      );
      throw new Error();
    }
    // Create a constant variable for the configuration
    const eventIndexerConfigVariable = {
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'configuredEventIndexer',
          initializer: _formatObjectToTsLiteral(indexer.configuredEventIndexer),
          type: 'EventIndexerConfig[]',
        },
      ],
      isExported: true,
    };
    sourceFile.addVariableStatement(eventIndexerConfigVariable);
  } else {
    const emptyEventIndexerConfigVariable = {
      declarationKind: VariableDeclarationKind.Const,
      declarations: [
        {
          name: 'configuredEventIndexer',
          initializer: '[]',
          type: 'EventIndexerConfig[]',
        },
      ],
      isExported: true,
    };
    sourceFile.addVariableStatement(emptyEventIndexerConfigVariable);
  }

  logger.info('EventIndexer config built.');
  return sourceFile;
}

const _formatEventIndexerConfigToTsLiteral = (config: EventIndexerConfig): string => {
  return `{chainIds: [${config.chainIds ? config.chainIds.join(', ') : ''}], url: "${config.url}"}`;
};

const _formatObjectToTsLiteral = (indexer: EventIndexerConfig[]): string => {
  return `[${indexer.map(_formatEventIndexerConfigToTsLiteral).join(', ')}]`;
};