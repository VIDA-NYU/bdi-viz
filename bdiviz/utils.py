from typing import Optional

from openai import OpenAI


class LLMAssistant:
    def __init__(self):
        self.client = OpenAI()

    def ask(self, context: str, model: str = "gpt-4-turbo-preview") -> Optional[str]:
        messages = [
            {
                "role": "system",
                "content": "You are an assistant for BDIViz Tool. A visualization tool for biomedical schema matching tasks. You are a helper for Expert-In-The-Loop biomedical researchers to provide discriptions for the columns in the dataset.",
            },
            {
                "role": "user",
                "content": context,
            },
        ]
        answers = self.client.chat.completions.create(
            model=model, messages=messages, temperature=0.3  # type: ignore
        )
        return answers.choices[0].message.content


def truncate_text(text: str, max_chars: int) -> str:
    if len(text) > max_chars:
        return text[:max_chars] + "..."
    else:
        return text
