# termai - AI powered CLI tool for explaining terminal output

---

### Description

A super lightweight CLI tool that can explain terminal output (from previous commands) using Ollama or any model supported by the OpenAI API v1 completion endpoints (includes more than openai models). The default configuration uses the Ollama generate API over localhost with the llama3.1 model. After running a command and getting output, run 'termai' and you will get an explanation of both the command and its output. Options to explain more than 1 command or use a custom prompt. You can even send regular prompts (without terminal output) as you would when using ollama models normally without needing to change commands or switch contexts.

Please note that the bash terminal does not store terminal output or offer a way to retrieve it so termai starts a script session and stores terminal output within a log file.

---
### Installation/Setup
To install run 
```
npm install -g term-ai
```

Then follow the basic setup.

```
termai --setup
```
You can customize the http address used for the generate request, the default is just http://localhost:11434, where 11434 is the standard Ollama port as well as change the default model (llama3.1).

### "What is Ollama?"

Ollama is a tool you can use to run models on your machine locally, they also offer cloud hosted models like deepseek, it is 100% free and easy to download/use. Go to https://ollama.ai/ for the official download. You can run
```
ollama list
```
to see what models are being offered by default, and
```
ollama pull llama3.1:latest
```
to download a new model (like llama3.1:latest). Make sure everything works by using the run command before using termai.
```
ollama run llama3 
```

### For WSL:

Note that if you are using WSL with ollama running on your main machine you can replace the localhost portion with your host machine ip address. You can choose Ollama WSL option during setup which does this automatically, although you can also find the host machine IP using this command in wsl:

```
ip route | grep default | awk '{print `$3}'
```
Back to windows on powershell, you must also set OLLAMA to listen on a network that WSL can connect to. One way to do this is let it listen on all interfaces 0.0.0.0, this is the easiest method but can also be potentially insecure in a public wifi setting.
```
setx OLLAMA_HOST 0.0.0.0
```
A better method is to setup a function in your powershell profile that gets your host machine ip from wsl (using the same command as before) and sets Ollama to listen on only that ip. If you don't have a powershell profile then run this powershell script first:
```
$profileDir = Split-Path $PROFILE -Parent
if (!(Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force
}
```
Then create the function with this script (easiest to combine both in a .ps1 file and run that in powershell)
```
@'
function Set-OllamaWSL {
    $wslIP = wsl -e bash -c "ip route | grep default | awk '{print `$3}'"
    setx OLLAMA_HOST $wslIP /M
    Write-Host "✅ Ollama now bound to WSL host IP: $wslIP" -ForegroundColor Green
}
'@ | Out-File $PROFILE -Encoding UTF8
```
Then open a new powershell terminal in admin mode and run:
```
Set-OllamaWSL
```
Going forward any time you start a new wsl instance and want to use termai you can run the Set-OllamaWSL command in powershell to update the interface with the new ip. If you don't want to setup the function you can just run this one-liner version each time you start a new wsl instance.
```
$wslIP = wsl -e bash -c "ip route | grep default | awk '{print `$3}'"; setx OLLAMA_HOST $wslIP /M; Write-Host "Ollama bound to: $wslIP"
```


### "Can I run non-Ollama models?"

The api calls are done through the openai API v1 chat completion endpoints, this is the most widely used LLM API specification in the world and it is compatable with Ollama, OpenAI (gpt models), Deepseek, and more. You can easily change this through the --setup command. Unfortunately it lacks compatability with Google and Anthropic models, support for these will have to be added in the future. 

---
### Usage
Available options:

```
Usage: termai [options] [query...]

Arguments:
  query        Direct prompt to Ollama (skips terminal context)

Options:
  -n <number>  Number of command blocks to retrieve (default: "1")
  -p <prompt>  Custom prompt (default: "Explain this terminal output.")
  -m <model>   Specify an Ollama model (default: "llama3.1:latest")
  -c           Make explanation concise
  --deep       Use DeepSeek model (cloud hosted, fast, powerful)
  --setup      Run interactive setup
  --config     Display current configuration
  -h, --help   display help for command
```
### Examples

```
lglen@omen-lg:~/termai$ echo 'what is 2+2'
what is 2+2
```
```
lglen@omen-lg:~/termai$ termai
> Querying llama3.1:latest at http://172.20.16.1:11434...

This terminal output is showing the result of running a command in the Linux or Unix terminal.

Here's what's happening:

1. `lglen` is the username of the user currently logged into the system.
2. `@omen-lg:` is the hostname (or network node name) of the computer they are using.
3. `~/termai` is the current working directory, which means the user is currently in their home directory (`~`) and has a subdirectory named `termai`.
4. The command `echo 'what is 2+2'` is being run. `echo` is a built-in Linux/Unix command that prints its arguments to the console.
5. The string `'what is 2+2'` is passed as an argument to the `echo` command, and it's printed to the console verbatim.

In other words, the terminal is simply echoing back what was typed, without performing any arithmetic operations or calculations on the input. The output is exactly what was entered: "what is 2+2".
```
can use n>1 to add previous prompts/output into context
```
lglen@omen-lg:~/termai$ termai -n 2 -p 'only explain the command being run'
> Querying llama3.1:latest at http://172.20.16.1:11434...

The command being run is `echo 'what is 2+2'`.
```
anything typed after 'termai' without arguments will be treated as a prompt, wrapping in quotes ('') is optional. This let's you query ollama or your model like normal without any terminal output
```
lglen@omen-lg:~/termai$ termai what is the capital of south africa?
> Querying llama3.1:latest at http://172.20.16.1:11434...

The capital of South Africa is Pretoria, although Cape Town serves as the legislative seat and Bloemfontein is the judicial seat. This unique arrangement is known as a "tripartite capital" or a "tricameral system," where:

* Pretoria (Tshwane) serves as the administrative capital
* Cape Town serves as the legislative capital (where Parliament meets)
* Bloemfontein serves as the judicial capital (where the Supreme Court of Appeal is located)

So, depending on the context, you might hear different answers!
```
### More Info
So far this project only supports bash terminals but I plan to add support for powershell as well. I will likely add support for more models in terms of their API configurations like claude, gemini, etc. You can always fork the repository and configure your own completions/APIs.