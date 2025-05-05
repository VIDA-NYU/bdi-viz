import os
from typing import List, Tuple

import numpy as np
import pandas as pd
import torch
from sentence_transformers import SentenceTransformer
from transformers import AutoModel, AutoTokenizer

from .column_encoder import ColumnEncoder

DEFAULT_MODELS = [
    "sentence-transformers/all-mpnet-base-v2",
    "Snowflake/snowflake-arctic-embed-m",
]


class EmbeddingClusterer:
    def __init__(self, params):
        self.params = params
        self.topk = params["topk"]
        self.embedding_threshold = params["embedding_threshold"]

        # Lazy initialization of model and tokenizer
        self._model = None
        self._tokenizer = None
        self._device = None

        self.model_name = params["embedding_model"]

    @property
    def device(self):
        if self._device is None:
            # Only determine device when needed
            self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        return self._device

    @property
    def tokenizer(self):
        if self._tokenizer is None:
            # Lazy load tokenizer
            base_model = (
                self.model_name
                if self.model_name in DEFAULT_MODELS
                else "sentence-transformers/all-mpnet-base-v2"
            )
            self._tokenizer = AutoTokenizer.from_pretrained(base_model)
        return self._tokenizer

    @property
    def model(self):
        if self._model is None:
            # Lazy load model only when needed
            if self.model_name in DEFAULT_MODELS:
                self._model = AutoModel.from_pretrained(self.model_name).to(self.device)
                print(f"Loaded ZeroShot Model on {self.device}")
            else:
                # Base model
                base_model = "sentence-transformers/all-mpnet-base-v2"
                self._model = SentenceTransformer(base_model)
                print(f"Loaded SentenceTransformer Model on {self.device}")

                # path to the trained model weights
                model_path = self.model_name
                if os.path.exists(model_path):
                    print(f"Loading trained model from {model_path}")
                    # Load state dict for the SentenceTransformer model
                    state_dict = torch.load(
                        model_path, map_location=self.device, weights_only=True
                    )
                    # Load weights compatible with SentenceTransformer
                    self._model.load_state_dict(state_dict)
                    self._model.eval()
                    self._model.to(self.device)
                else:
                    print(f"Trained model not found at {model_path}")
        return self._model

    def _get_embeddings(self, texts, batch_size=32):
        if self.model_name in DEFAULT_MODELS:
            return self._get_embeddings_zs(texts, batch_size)
        else:
            return self._get_embeddings_ft(texts, batch_size)

    def _get_embeddings_zs(self, texts: List[str], batch_size=32):
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            inputs = self.tokenizer(
                batch_texts,
                padding=True,
                # Move inputs to device
                truncation=True,
                return_tensors="pt",
            ).to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)
            embeddings.append(outputs.last_hidden_state.mean(dim=1))
        return torch.cat(embeddings)

    def _get_embeddings_ft(self, texts, batch_size=32):
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i : i + batch_size]
            with torch.no_grad():
                batch_embeddings = self.model.encode(
                    batch_texts, show_progress_bar=False, device=self.device
                )
            embeddings.append(torch.tensor(batch_embeddings))
        return torch.cat(embeddings)

    def get_source_embeddings(self, source_df: pd.DataFrame) -> np.ndarray:
        encoder = ColumnEncoder(
            self.tokenizer,
            encoding_mode=self.params["encoding_mode"],
            sampling_mode=self.params["sampling_mode"],
            n_samples=self.params["sampling_size"],
        )

        input_col_repr_dict = {
            encoder.encode(source_df, col): col for col in source_df.columns
        }

        cleaned_input_col_repr = list(input_col_repr_dict.keys())

        embeddings_input = np.array(self._get_embeddings(cleaned_input_col_repr))

        return embeddings_input
