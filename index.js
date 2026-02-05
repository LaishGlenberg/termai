#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { program } from 'commander';
import fetch from 'node-fetch';

const CONFIG_PATH = path.join(os.homedir(), '.termai.json');
const LOGFILE = '/tmp/current_terminal.log';

// Default configuration
let config = {
  ollamaUrl: 'http://172.20.16.1:11434',
  defaultModel: 'llama3.1:latest'
};

// Load existing config if it exists
if (fs.existsSync(CONFIG_PATH)) {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

program
  .name('termai')
  .description('AI terminal assistant and output explainer')
  .argument('[query...]', 'Direct prompt to Ollama (skips terminal context)')
  .option('-n <number>', 'Number of command blocks to retrieve', '1')
  .option('-p <prompt>', 'Custom prompt', 'Explain this terminal output.')
  .option('-m <model>', 'Specify an Ollama model', config.defaultModel)
  .option('--deep', 'Use DeepSeek model')
  .option('--setup', 'Run interactive setup')
  .option('--config', 'Display current configuration')
  .parse(process.argv);

const options = program.opts();
const args = program.args;
const model = options.deep ? 'deepseek-v3.1:671b-cloud' : options.m;

// --- UTILS ---
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise((resolve) => rl.question(q, resolve));

function cleanTerminalOutput(str) {
  let cleaned = str.replace(/\0/g, '').replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1B\].*?(\x07|\x1B\\)/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let last;
  do { last = cleaned; cleaned = cleaned.replace(/[^\n][\x08\x7f]/g, '').replace(/^[\x08\x7f]+/g, ''); } while (cleaned !== last);
  return cleaned.replace(/\u001b/g, '');
}

async function streamOllama(prompt) {
  process.stderr.write(`> Querying ${model} at ${config.ollamaUrl}...\n`);
  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: true })
    });
    if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
    for await (const chunk of response.body) {
      const jsonStrings = chunk.toString().split('\n').filter(Boolean);
      for (const str of jsonStrings) {
        try {
          const json = JSON.parse(str);
          if (json.response) process.stdout.write(json.response);
        } catch (e) {}
      }
    }
    process.stdout.write('\n');
  } catch (err) {
    console.error(`\nConnection failed: ${err.message}. Is Ollama running?`);
  }
}

// --- COMMANDS ---
if (options.setup) {
  console.log('--- termai Setup ---');
  
  const newUrl = await question(`Ollama URL [${config.ollamaUrl}]: `);
  if (newUrl) config.ollamaUrl = newUrl;

  const newModel = await question(`Default Model [${config.defaultModel}]: `);
  if (newModel) config.defaultModel = newModel;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Settings saved to ' + CONFIG_PATH);

  const doBash = await question('Enable terminal logging in .bashrc? (y/n): ');
  if (doBash.toLowerCase() === 'y') {
    const bashrcPath = path.join(os.homedir(), '.bashrc');
    const setupCode = `\n# --- TERMAI LOGGING START ---\nif [ -z "$SCRIPT_LOGGING" ] && [ "$TERM" != "dumb" ]; then\n    export SCRIPT_LOGGING=1\n    while true; do\n        script -q -f /tmp/current_terminal.log\n        if [ -f /tmp/restart_termai ]; then\n            rm /tmp/restart_termai\n            > /tmp/current_terminal.log\n            sleep 0.1\n            continue\n        else\n            break\n        fi\n    done\n    exit\nfi\nalias clearlog='touch /tmp/restart_termai && exit'\n# --- TERMAI LOGGING END ---\n`;
    
    const content = fs.readFileSync(bashrcPath, 'utf-8');
    if (!content.includes('SCRIPT_LOGGING')) {
      fs.appendFileSync(bashrcPath, setupCode);
      console.log('Updated .bashrc. !!! RUN THIS NOW: source ~/.bashrc !!!');
    } else {
      console.log('.bashrc logging already configured.');
    }
  }
  rl.close();
} 

else if (options.config) {
  console.log(JSON.stringify(config, null, 2));
  process.exit(0);
}

else {
  rl.close();
  // Execute main logic
  if (args.length > 0) {
    await streamOllama(args.join(' '));
  } else {
    if (!fs.existsSync(LOGFILE)) {
      console.error('Logging not active. Run: termai --setup');
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 150));
    const rawContent = fs.readFileSync(LOGFILE, 'utf-8');
    const cleanedContent = cleanTerminalOutput(rawContent);
    const allLines = cleanedContent.split('\n').filter(line => {
      const l = line.trim();
      return l !== '' && !l.startsWith('> Querying') && !l.includes('Script started') && !l.includes('Script done');
    });

    const promptRegex = /^[a-zA-Z0-9_-]+@[a-zA-Z0-9._-]+:.*[$#]\s/;
    const numBlocks = parseInt(options.n);
    let blocksFound = 0;
    let selectedLines = [];

    for (let i = allLines.length - 1; i >= 0; i--) {
      const isPrompt = promptRegex.test(allLines[i]);
      if (isPrompt) blocksFound++;
      if (blocksFound === 1 && isPrompt) continue;
      if (blocksFound > numBlocks + 1) break;
      selectedLines.unshift(allLines[i]);
      if (isPrompt && blocksFound === numBlocks + 1) break;
    }

    const finalPrompt = `${options.p}\n\nTerminal context:\n\`\`\`text\n${selectedLines.join('\n')}\n\`\`\``;
    await streamOllama(finalPrompt);
  }
}