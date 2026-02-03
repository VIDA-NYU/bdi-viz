import importlib
import sys
import types

import pytest


def _import_rag(monkeypatch):
    hub_mod = types.ModuleType("langchain.hub")

    def pull(name):
        return f"prompt:{name}"

    hub_mod.pull = pull

    langchain_mod = types.ModuleType("langchain")
    langchain_mod.hub = hub_mod

    docs_mod = types.ModuleType("langchain_core.documents")

    class Document:
        def __init__(self, page_content=""):
            self.page_content = page_content

    docs_mod.Document = Document

    loaders_mod = types.ModuleType("langchain_community.document_loaders")

    class JSONLoader:
        def __init__(self, file_path, jq_schema, text_content=False):
            self.file_path = file_path

        def load(self):
            return [Document(page_content=self.file_path)]

    loaders_mod.JSONLoader = JSONLoader

    chat_mod = types.ModuleType("langchain_core.language_models.chat_models")

    class BaseChatModel:
        pass

    chat_mod.BaseChatModel = BaseChatModel

    vector_mod = types.ModuleType("langchain_core.vectorstores")

    class InMemoryVectorStore:
        def __init__(self, embeddings):
            self.embeddings = embeddings
            self.docs = []

        def add_documents(self, docs):
            self.docs.extend(docs)
            return docs

        def similarity_search(self, question, k=3):
            return self.docs[:k]

    vector_mod.InMemoryVectorStore = InMemoryVectorStore

    hf_mod = types.ModuleType("langchain_huggingface")

    class HuggingFaceEmbeddings:
        def __init__(self, model_name):
            self.model_name = model_name

    hf_mod.HuggingFaceEmbeddings = HuggingFaceEmbeddings

    split_mod = types.ModuleType("langchain_text_splitters")

    class RecursiveCharacterTextSplitter:
        def __init__(self, chunk_size=1000, chunk_overlap=200):
            self.chunk_size = chunk_size
            self.chunk_overlap = chunk_overlap

        def split_documents(self, docs):
            return docs

    split_mod.RecursiveCharacterTextSplitter = RecursiveCharacterTextSplitter

    monkeypatch.setitem(sys.modules, "langchain", langchain_mod)
    monkeypatch.setitem(sys.modules, "langchain.hub", hub_mod)
    monkeypatch.setitem(sys.modules, "langchain_community.document_loaders", loaders_mod)
    monkeypatch.setitem(sys.modules, "langchain_core.documents", docs_mod)
    monkeypatch.setitem(
        sys.modules, "langchain_core.language_models.chat_models", chat_mod
    )
    monkeypatch.setitem(sys.modules, "langchain_core.vectorstores", vector_mod)
    monkeypatch.setitem(sys.modules, "langchain_huggingface", hf_mod)
    monkeypatch.setitem(sys.modules, "langchain_text_splitters", split_mod)

    sys.modules.pop("api.langchain.rag", None)
    return importlib.import_module("api.langchain.rag")


def test_rag_retrieve(monkeypatch):
    rag_mod = _import_rag(monkeypatch)
    rag = rag_mod.Rag()

    docs = rag.retrieve("question", top_k=1)
    assert len(docs) == 1
    assert rag.vector_store.docs
    sys.modules.pop("api.langchain.rag", None)


def test_rag_init_raises_when_no_schema(monkeypatch):
    rag_mod = _import_rag(monkeypatch)
    monkeypatch.setattr(rag_mod.Rag, "load_json_schemas", lambda self: [])

    with pytest.raises(ValueError):
        rag_mod.Rag()
    sys.modules.pop("api.langchain.rag", None)
