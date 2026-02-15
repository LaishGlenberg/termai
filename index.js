#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { program } from 'commander';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import { execSync } from 'child_process';
import startSetup from './setup.js';

const CONFIG_PATH = path.join(os.homedir(), '.termai.json');
const LOGFILE = '/tmp/current_terminal.log';
const HISTORY_LOG = path.join(os.homedir(), '.command_log');

// Default configuration
let config = {
  ollamaUrl: 'http://172.20.16.1:11434',
  defaultModel: 'llama3.1:latest',
  apiKey: "your-api-key",
  logsizeMax: "50"
};

const rlOps = {
  yes: ['yes', 'y', 'ok', 'okay', ''],
  no: ['no', 'n', 'exit', 'false', 'quit']
}

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
//const question = (q) => new Promise((resolve) => rl.question(q, resolve));

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
  await startSetup(rl)

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

    const historyCmds = fs.existsSync(HISTORY_LOG) 
      ? fs.readFileSync(HISTORY_LOG, 'utf-8').split('\n').filter(l => l.trim() !== '')
      : [];
    
    let promptsCounted = 0;
    const formattedLines = [];
    let outputBuffer = [];

    // Process backwards to group output with its preceding command
    for (let j = selectedLines.length - 1; j >= 0; j--) {
      const line = selectedLines[j];
      if (promptRegex.test(line)) {
        // We hit a prompt, so the buffer contains all output that followed this command
        if (outputBuffer.length > 0) {
          formattedLines.unshift(`TERMINAL_OUTPUT:\n${outputBuffer.join('\n')}`);
          outputBuffer = [];
        }

        promptsCounted++;
        const histIndex = historyCmds.length - promptsCounted;
        let command = (histIndex >= 0 && historyCmds[histIndex]) ? historyCmds[histIndex] : line;
        
        // No longer need to aggressively strip numbers if we did it in PROMPT_COMMAND,
        // but we'll keep a simple trim to ensure it looks good.
        command = command.trim();
        
        formattedLines.unshift(`TERMINAL_COMMAND: ${command}`);
      } else {
        outputBuffer.unshift(line);
      }
    }

    // Capture any output that might exist before the very first prompt in the selection
    if (outputBuffer.length > 0) {
      formattedLines.unshift(`TERMINAL_OUTPUT:\n${outputBuffer.join('\n')}`);
    }

    const conciseMsg = options.c ? 'KEEP ANSWER CONCISE' : ''
    const extraInstrct = options.p === "Explain this terminal output" ? "Do not mention the shell prompt (<user>:<dir>$) portion unless asked." : ''
    const finalPrompt = `${options.p} ${extraInstrct} ${conciseMsg}\n\nTerminal context:\n\`\`\`text\n${formattedLines.join('\n')}\n\`\`\``;
    //console.log(JSON.stringify(finalPrompt, null, 2));
    console.log(finalPrompt)
    //await streamOllama(finalPrompt);
  }
}
//tail -f /tmp/current_terminal.log | cat -v
//export PROMPT_COMMAND='echo "$USER@$HOSTNAME:${PWD/#$HOME/~}$ $(history 1 | sed "s/^[ ]*[0-9]*[ ]*//")" >> ~/.command_log'

/* 
# --- TERMAI LOGGING START ---
if [ -z "$SCRIPT_LOGGING" ] && [ "$TERM" != "dumb" ]; then
    export SCRIPT_LOGGING=1
    
    # Auto-rotate WITHOUT exiting. Keeps the last half of 51200 bytes.
    # Uses -c (bytes) for precision.
    export PROMPT_COMMAND='if [ -f /tmp/current_terminal.log ] && [ $(stat -c%s /tmp/current_terminal.log) -gt 51200 ]; then cp /tmp/current_terminal.log /tmp/termai_rotate.tmp && tail -c $((51200 / 2)) /tmp/termai_rotate.tmp > /tmp/current_terminal.log && rm /tmp/termai_rotate.tmp && echo "--- Log file reached $((51200 / 1024)) KB. Trimmed to keep context. ---"; fi'
    
    while true; do
        # Use -a (append) to allow background truncation
        script -q -a -f /tmp/current_terminal.log
        
        # This part only runs if you manually type 'exit' or use an alias
        if [ -f /tmp/restart_termai ]; then
            rm /tmp/restart_termai
            > /tmp/current_terminal.log
            continue
        fi
        break
    done
    if [ -f /tmp/termai_nolog ]; then rm /tmp/termai_nolog; else exit; fi
fi
# Safe manual clear that doesn't restart the session
alias clearlog='cp /tmp/current_terminal.log /tmp/termai_rotate.tmp && tail -c 100 /tmp/termai_rotate.tmp > /tmp/current_terminal.log && rm /tmp/termai_rotate.tmp && echo "Log cleared."'
alias nolog='touch /tmp/termai_nolog && exit'
# --- TERMAI LOGGING END ---
*/