import asyncio, os

# === AYARLAR ===
AGENT_MODEL = "llama3.1:8b"      # Tool calling için
CODER_MODEL = "qwen2.5-coder:14b"  # Kod üretimi için

os.environ["OLLAMA_ORIGINS"] = "*"
os.environ["OLLAMA_HOST"] = "0.0.0.0:11434"

async def run(cmd):
    print('>>> starting', *cmd)
    p = await asyncio.subprocess.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    async def pipe(lines):
        async for line in lines:
            s = line.decode('utf-8', errors='ignore').strip()
            if s:
                print(s)
    await asyncio.gather(pipe(p.stdout), pipe(p.stderr))

async def pull_models(models: list):
    await asyncio.sleep(5)  # Ollama'nın başlamasını bekle

    for model in models:
        print(f'>>> pulling {model}...')
        p = await asyncio.subprocess.create_subprocess_exec(
            'ollama', 'pull', model,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await p.wait()
        print(f'>>> {model} ready!')

    print('>>> All models ready!')

await asyncio.gather(
    run(['ollama', 'serve']),
    run(['cloudflared', 'tunnel', '--url', 'http://127.0.0.1:11434']),
    pull_models([AGENT_MODEL, CODER_MODEL])
)
