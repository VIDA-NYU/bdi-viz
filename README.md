# bdi-viz
[![Tests](https://github.com/VIDA-NYU/bdi-viz/actions/workflows/build.yml/badge.svg)](https://github.com/VIDA-NYU/bdi-viz/actions/workflows/build.yml)
[![Lint](https://github.com/VIDA-NYU/bdi-viz/actions/workflows/lint.yml/badge.svg)](https://github.com/VIDA-NYU/bdi-viz/actions/workflows/lint.yml)
[![Documentation Status](https://readthedocs.org/projects/bdi-viz/badge/?version=latest)](https://bdi-viz.readthedocs.io/en/latest/)


## Contents

- [1. Introduction](#sparkle-1-introduction)
- [2. Installation](#package-2-installation)
- [3. Quick Start](#rocket-3-quick-start)
- [4. Documentation](#page_facing_up-4-documentation)
  - [4.1 Read the Docs](#41-read-the-docs)
  - [4.2 Demo Video](#42-demo-video)

## :sparkle: 1. Introduction

BDIViz is a powerful, interactive tool designed as an extension to [BDIKit](https://github.com/VIDA-NYU/bdi-kit) to assist biomedical researchers and domain experts in performing schema matching tasks. Built to address the challenges of matching complex biomedical datasets, BDIViz leverages a visual approach to streamline the process and enhance both speed and accuracy.

Key features of BDIViz include:

- **Interactive Heatmap** for exploring and comparing matching candidates.
- **Value Comparisons** Panel for analyzing similarities between attributes.
- **Detailed Analysis** Panel offering in-depth insights into attribute value distributions.
- **Filtering & Refinement Tools** to customize and adjust matching candidates based on datatype and similarity scores.
- **Expert-in-the-Loop Workflow** allowing users to iteratively accept, reject, or refine matches, keeping the expert in control of decision-making.

BDIViz is designed to be integrated with Python notebooks, providing a flexible and easy-to-use tool for domain-specific schema matching in biomedical research and beyond.

## :package: 2. Installation

To use ``BDI-Viz``, install it using pip:

```bash
pip install bdi-viz
```


## :rocket: 3. Quick Start
``BDI-Viz 1.0`` is built leveraging [Panel](https://panel.holoviz.org/). The application is designed to provide a user-friendly interface on jupyter notebooks. Where users can explore the schema matching recommandations, interact with the result, and pass them to the next step of the data integration process.

```python
import pandas as pd
from bdiviz import BDISchemaMatchingHeatMap

# Load the data
source_df = pd.read_csv('data/source.csv')
target_df = pd.read_csv('data/target.csv')

# Render the BDI-Viz Heatmap
heatmap_manager = BDISchemaMatchingHeatMap(
    source=source_df,
    target=target_df,
    top_k=20,
)
heatmap_manager.plot_heatmap()
```

The following interface will be displayed in the jupyter notebook:
![BDIViz Demo](docs/bdiviz-demo.png)


## :page_facing_up: 4. Documentation

### 4.1 Read the Docs
For more information, please refer to the [documentation](https://bdi-viz.readthedocs.io/en/latest/).

### 4.2 Demo Video
[BDIViz Demo](https://drive.google.com/file/d/1eAbDicO0oXIbbVg56m3H8xdNDDsBGBLI/view?usp=drive_link)

