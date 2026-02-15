#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.termai.json');

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

// --- UTILS ---
/* const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (q) => new Promise((resolve) => rl.question(q, resolve)); */

function removeTermaiLoggingSection(bashrcPath) {
    const startMarker = '# --- TERMAI LOGGING START ---';
    const endMarker = '# --- TERMAI LOGGING END ---';
    const content = fs.readFileSync(bashrcPath, 'utf-8');
    const lines = content.split('\n');
    let inBlock = false;
    const newLines = [];
    for (const line of lines) {
        if (line.includes(startMarker)) {
            inBlock = true;
            continue;
        }
        if (inBlock && line.includes(endMarker)) {
            inBlock = false;
            continue;
        }
        if (!inBlock) {
            newLines.push(line);
        }
    }
    fs.writeFileSync(bashrcPath, newLines.join('\n'), 'utf-8');
    console.log('TERMAI logging section removed from .bashrc');
}

const BASH_TEXT = `
# --- TERMAI LOGGING START ---
# Only start logging in interactive shells
case $- in
    *i*) ;;
      *) return ;;
esac

LOGFILE="/tmp/current_terminal.log"
LOGSIZE=%%LOGSIZE%%

# Start logging once
if [ -z "$TERMAI_ACTIVE" ]; then
    export TERMAI_ACTIVE=1
    script -q -a -f "$LOGFILE"
fi

command_logger() {
    local cmd
    cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')

    # Prevent logging internal commands
    [[ "$cmd" == "$BASH_COMMAND" ]] && return

    echo "$USER@$HOSTNAME:\${PWD/#$HOME/~}\$ $cmd" >> ~/.command_log
}

trap command_logger DEBUG

rotate_log() {
    if [ -f "$LOGFILE" ]; then
        size=$(stat -c%s "$LOGFILE")
        if (( size > LOGSIZE )); then
            tmp=$(mktemp)
            cp "$LOGFILE" "$tmp"
            tail -c $((LOGSIZE / 2)) "$tmp" > "$LOGFILE"
            rm "$tmp"
            echo "--- Log trimmed ---"
        fi
    fi
}

PROMPT_COMMAND="rotate_log"

alias clearlog='> /tmp/current_terminal.log; > ~/.command_log; echo "Logs cleared."'
alias nolog='unset TERMAI_ACTIVE; exit'
# --- TERMAI LOGGING END ---
`

async function startSetup(rl) {
    console.log("--- termai Setup ('enter' to skip) ---");
    const question = (q) => new Promise((resolve) => rl.question(q, resolve));

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

    let doBash = ''
    const has_logging = content.includes('TERMAI LOGGING START')

    if (!has_logging) {
        doBash = await question('Allow terminal logging in .bashrc? (y/n): ');
    } else {
        doBash = await question('Reload/redo .bashrc logging? (y/n): ');
    }

    if (rlOps.yes.includes(doBash.toLowerCase())) {
        if (has_logging) {
            removeTermaiLoggingSection(bashrcPath)
        }

        console.log('Set custom upperbound on log file size.')
        const newLogSize = await question(`Clear log file when >= [${config.logsizeMax} KB]: `);
        if (newLogSize) config.logsizeMax = newLogSize;

        let setupCode = BASH_TEXT//fs.readFileSync('bash-setup.txt', 'utf-8');
        setupCode = setupCode.replace(/%%LOGSIZE%%/g, Number(config.logsizeMax) * 1024);
        fs.appendFileSync(bashrcPath, setupCode);
        console.log('Updated .bashrc. !!! RUN THIS NOW: source ~/.bashrc !!!');

    } else if (has_logging) {
        return
    } else if (rlOps.no.includes(doBash.toLowerCase())) {
        console.log("termai needs to log terminal output in order to work. The bash terminal does not store output on its own. Run 'termai --setup' to start the setup process again")
    } else {
        console.log("Input not recognized, logging setup failed, run 'termai --setup' to start the setup process again")
    }

    //rl.close();
}

export default startSetup;