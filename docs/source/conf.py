# Configuration file for the Sphinx documentation builder.

import os
import sys

sys.path.insert(0, os.path.abspath("../../"))

# -- Project information

project = "BDI-Viz"
copyright = "2024, NYU VIDA Lab"
author = "Eden Wu"

release = "0.1"
version = "0.1.0"

# -- General configuration

extensions = [
    "sphinx.ext.duration",
    "sphinx.ext.doctest",
    "sphinx.ext.autodoc",
    "sphinx.ext.autosummary",
    "sphinx.ext.intersphinx",
    "nbsphinx",
]

intersphinx_mapping = {
    "python": ("https://docs.python.org/3/", None),
    "sphinx": ("https://www.sphinx-doc.org/en/master/", None),
}
intersphinx_disabled_domains = ["std"]

templates_path = ["_templates"]

# -- Options for HTML output

html_theme = "sphinx_rtd_theme"

# -- Options for EPUB output
epub_show_urls = "footnote"

autodoc_member_order = "bysource"

autoclass_content = "both"

add_module_names = False

autodoc_mock_imports = [
    "bdi-kit",
    "bdikit",
    "bokeh",
    "datamart_profiler",
    "sklearn",
    "pandas",
    "numpy",
    "IPython",
    "torch",
    "transformers",
    "matplotlib",
    "openai",
    "polyfuzz",
    "flair",
    "autofj",
    "Levenshtein",
    "valentine",
    "altair",
    "panel",
    "tqdm",
    "rapidfuzz",
]
