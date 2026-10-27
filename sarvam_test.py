import os
from pathlib import Path

from sarvamai import SarvamAI


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines from .env into the environment without overriding existing values."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(Path(__file__).resolve().parent / ".env")

api_key = os.environ.get("SARVAM_API_KEY", "")
if not api_key:
    raise SystemExit("SARVAM_API_KEY is empty. Add your key to .env and run again.")

client = SarvamAI(api_subscription_key=api_key)

response = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[{"role": "user", "content": "Say hello in one short sentence."}],
)
print(response.choices[0].message.content)
