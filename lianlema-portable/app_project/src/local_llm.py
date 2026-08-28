import os


DEFAULT_OLLAMA_MODEL = "gemma4:e2b"


def get_ollama_model():
    model = os.getenv("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL).strip()
    return model or DEFAULT_OLLAMA_MODEL


def chat_with_ollama_model(messages, client=None, model_name=None):
    selected_model = model_name or get_ollama_model()
    if client is None:
        import ollama as client

    return client.chat(model=selected_model, messages=messages)
