#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { program } from 'commander';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { execSync } from 'child_process';

const CONFIG_PATH = path.join(os.homedir(), '.termai.json');
const LOGFILE = '/tmp/current_terminal.log';

// Default configuration
let config = {
  ollamaUrl: 'http://172.20.16.1:11434',
  defaultModel: 'llama3.1:latest',
  apiKey: "your-api-key",
  logsizeMax: "50"
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
  .option('-p <prompt>', 'Custom prompt', 'Explain this terminal output')
  .option('-m <model>', 'Specify an Ollama model', config.defaultModel)
  .option('-c', 'Make explanation concise')
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

function getWslHostIp(url) {
  if (url.includes('WSL_HOST')) {
    try {
      // Executes the shell command and gets the output
      const hostIp = execSync("ip route | grep default | awk '{print $3}'").toString().trim();
      return url.replace('WSL_HOST', hostIp);
    } catch (e) {
      console.warn('> Warning: Could not detect WSL host IP, falling back to localhost.');
      return url.replace('WSL_HOST', '127.0.0.1');
    }
  }
  return url;
}

const resolvedUrl = getWslHostIp(config.ollamaUrl);

// Initialize OpenAI client with the resolved URL
const openai = new OpenAI({
  baseURL: resolvedUrl.endsWith('/v1') ? resolvedUrl : `${resolvedUrl}/v1`,
  apiKey: config.apiKey,
});

function cleanTerminalOutput(str) {
  // 1. Normalize CRLF and strip OSC (titles)
  let cleaned = str.replace(/\r\n/g, '\n').replace(/\0/g, '').replace(/\x1B\].*?(\x07|\x1B\\)/g, '');
  
  let last;
  do {
    last = cleaned;
    cleaned = cleaned
      .replace(/[^\n][\x08\x7f]/g, '')            // Handle backspaces (^H)
      .replace(/\x1B\[(\d+)?P/g, '')              // Strip "Delete Character" sequences
      .replace(/\r(?!\n)/g, '\n')                 // Convert raw \r to newline to prevent text merging
      .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, ''); // Strip remaining ANSI (colors/moves)
  } while (cleaned !== last);

  return cleaned.replace(/\x1B/g, '').trim();
}

async function streamOllama(prompt) {
  process.stderr.write(`> Querying ${model} at ${openai.baseURL}...\n`);
  try {
    const stream = await openai.chat.completions.create({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      process.stdout.write(content);
    }
    process.stdout.write('\n');
  } catch (err) {
    console.error(`\nConnection failed: ${err.message}. Is the AI service running?`);
  }
}

// --- COMMANDS ---
if (options.setup) {
  console.log("--- termai Setup ('enter' to skip) ---");

  /* const newUrl = await question(`Ollama URL [${config.ollamaUrl}]: `);
  if (newUrl) config.ollamaUrl = newUrl; */
  const apiShortcuts = `
  Enter your own endpoint or type 0, 1, 2 for shortcut:
    [0] Ollama local (default) -> http://localhost:11434
    [1] OpenAI model -> https://api.openai.com
    [2] Ollama WSL (dynamic host) -> http://WSL_HOST:11434 
  `;
  console.log(apiShortcuts); // Fixed: actually log the shortcuts
  
  const newUrl = await question(`API Base URL [${config.ollamaUrl}]: `);
  switch (newUrl) {
    case '0': config.ollamaUrl = 'http://localhost:11434'; break;
    case '1': config.ollamaUrl = 'https://api.openai.com'; break;
    case '2': 
      config.ollamaUrl = 'http://WSL_HOST:11434'; 
      console.log('> WSL Dynamic Host selected. IP will be detected at runtime.');
      break;
    case '': break;
    default:
      config.ollamaUrl = newUrl;
  }

  const newKey = await question(`API Key (optional for Ollama) [${config.apiKey}]: `);
  if (newKey) config.apiKey = newKey;

  const newModel = await question(`Default Model [${config.defaultModel}]: `);
  if (newModel) config.defaultModel = newModel;

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log('Settings saved to ' + CONFIG_PATH);

  const bashrcPath = path.join(os.homedir(), '.bashrc');
  //5242880
  const content = fs.readFileSync(bashrcPath, 'utf-8');
  if (!content.includes('SCRIPT_LOGGING')) {
    while (true) {
      const doBash = await question('Allow terminal logging in .bashrc? (y/n/exit): ');
      if (doBash.toLowerCase() === 'y' || doBash.toLowerCase() === '') {
        console.log('Set custom upperbound on log file size. Must manually edit .bashrc if you want to change it again')
        const newLogSize = await question(`Clear log file when >= [${config.logsizeMax} KB]: `);
        if (newLogSize) config.logsizeMax = newLogSize;

        let setupCode = fs.readFileSync('bash-setup.txt', 'utf-8');
        setupCode = setupCode.replace(/%%LOGSIZE%%/g, Number(config.logsizeMax)*1024);
        fs.appendFileSync(bashrcPath, setupCode);
        console.log('Updated .bashrc. !!! RUN THIS NOW: source ~/.bashrc !!!');
        break;
      } else if (doBash.toLowerCase() === 'exit') {
        console.log("Exiting setup, termai won't be usable until you enable logging. Run 'termai --setup' to start the setup process again")
        break;
      } else {
        console.log("termai needs to log terminal output in order to work. The bash terminal does not store output on its own. Type 'exit' to quit loop")
      }
    }
  } else {
    console.log('.bashrc logging already configured.');
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

    // Label lines to help LLM distinguish command from output
    const formattedLines = selectedLines.map(line => {
      return promptRegex.test(line) ? `USER_COMMAND: ${line}` : `SYSTEM_OUTPUT: ${line}`;
    });

    const conciseMsg = options.c ? 'KEEP ANSWER CONCISE' : ''
    const extraInstrct = options.p === "Explain this terminal output" ? '' : "Do not mention the shell prompt (<user>:<dir>$) portion unless asked."
    const finalPrompt = `${options.p} ${extraInstrct} ${conciseMsg}\n\nTerminal context:\n\`\`\`text\n${formattedLines.join('\n')}\n\`\`\``;
    console.log(JSON.stringify(finalPrompt, null, 2));
    await streamOllama(finalPrompt);
  }
}//tail -f /tmp/current_terminal.log | cat -v