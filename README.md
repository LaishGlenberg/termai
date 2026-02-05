# termai - AI powered CLI tool for explaining terminal output

---

### Description

A super lightweight CLI tool that can explain terminal output (from previous commands) using an Ollama model of your choosing. The default configuration uses the Ollama generate API over localhost with the llama3.1 model. After running a command and getting output, run 'termai' and you will get an explanation of both the command and its output. Options to explain more than 1 command or use a custom prompt. You can even send regular prompts (without terminal output) as you would when using ollama models normally without needing to change commands or switch contexts.

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

### For WSL:

Note that if you are using WSL with ollama running on your main machine you can replace the localhost portion with your host machine ip address. To find host machine ip run this command in WSL:

```
ip route | grep default
```
and in windows (powershell) tell Ollama to listen on all interfaces (0.0.0.0)
```
setx OLLAMA_HOST 0.0.0.0
```

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
So far this project only supports bash terminals but I plan to add support for powershell as well. I will likely add support for more models in terms of their API configurations like openai, gemini, etc. You can always fork the repository and configure your own completions/APIs.