<h1 align="center">BDIViz: An Interactive Visualization System for Biomedical Schema Matching with LLM-Powered Validation</h2>

[![read-the-docs](https://img.shields.io/badge/User_Manual-Read_the_Docs-blue?style=for-the-badge&logo=read-the-docs)](https://vida-nyu.github.io/bdi-viz-manual/) [![paper-ieee](https://img.shields.io/badge/Paper-IEEE_TVCG_2026-brown?style=for-the-badge&logo=ieee)](https://www.computer.org/csdl/journal/tg/2026/01/11299421/2cojjOAcRCo)

[![docker-amd64-portkey](https://img.shields.io/badge/docker-amd64_gemini-lightblue?style=for-the-badge&logo=docker)](https://hub.docker.com/layers/edenwu/bdi-viz-react/amd64/images/sha256-be8167ca3bb406e0d704a9805cb990e5cde04fd929ac23c51e13e5aed6c6d901) [![docker-arm64-portkey](https://img.shields.io/badge/docker-arm64_gemini-lightblue?style=for-the-badge&logo=docker)](https://hub.docker.com/layers/edenwu/bdi-viz-react/arm64/images/sha256-dfedf5a2c525182c65e3b30b31c0fe2e986a98cb9b17d1c9c876479bfee39800)
  
</div>


## Table of Contents

* [1. Environment Setup](#gear-getting-started)
* [2. Documentation](#books-documentation)
* [3. Introduction](#gear-introduction)
* [4. Features](#gear-features)
* [5. Demo](#camera-demo)
* [6. Citation](#bookmark-citation)


## :gear: Getting Started

First, install the required dependencies:

```bash
npm i .
```


Then, start the server:

To run locally with Gemini-2.5-flash, run:
```bash
npm run build && npm run start
```

To run locally with GPT-4.1-mini, run:
```bash
npm run build && LLM_PROVIDER=openai npm run start
```

## :books: Documentation

- User manual: [Read the Docs](https://vida-nyu.github.io/bdi-viz-manual/)
- Published paper: [IEEE Computer Society Digital Library](https://www.computer.org/csdl/journal/tg/2026/01/11299421/2cojjOAcRCo)
- Repository docs and bundled assets: [`docs/`](docs/)
- TVCG camera-ready paper PDF: [`docs/2025_VIS_BDIViz_Camera_Ready.pdf`](docs/2025_VIS_BDIViz_Camera_Ready.pdf)
- TVCG demo video: [`docs/bdiviz_video.mp4`](docs/bdiviz_video.mp4)
- SIGMOD Demo 2026 paper PDF: [`docs/_SIGMOD_2026_Demo__BDIViz.pdf`](docs/_SIGMOD_2026_Demo__BDIViz.pdf)
- SIGMOD Demo 2026 video: [`docs/bdiviz_sigmod_demo_2026_w_sub.mp4`](docs/bdiviz_sigmod_demo_2026_w_sub.mp4)
- SIGMOD Demo 2026 video mirror: [Google Drive](https://drive.google.com/file/d/1gbyijnJfJMTqUJka081qtpet29Rt8hWS/view?usp=drive_link)

## :gear: Introduction

**BDIViz** is an interactive web-based application developed as part of the ARPA-H ASKEM project to support schema matching and value mapping tasks in biomedical data integration. It provides users with a rich visual interface—including heatmaps, explanations, and value comparisons—to streamline the process of aligning raw biomedical datasets with standardized data schemas such as the Genomic Data Commons (GDC) and Proteomic Data Commons (PDC).

**BDIViz** is model agnostic, meaning it can be used with any schema matching model. It is designed to work with the [BDI-Kit](https://github.com/VIDA-NYU/bdi-kit) module, which is a Python library that provides a set of tools for schema matching and value mapping tasks. The BDI-Kit module includes a variety of schema matching algorithms, including supervised and unsupervised methods, as well as tools for data preprocessing and feature extraction. 

## :gear: Features

- 🔍 **Interactive Heatmap** for exploring source-target column match candidates
- 📊 **Value Comparison Table** using fuzzy matching on raw values
- 🤖 **LLM-Powered Agent Panel** for dynamic match explanations and feedback
- ⏪ **Timeline View** to trace user actions (accept, reject, discard)
- 🎯 **Control Panel** for adjusting similarity threshold and navigating source columns
- 📤 **Export Curated Mappings** as JSON or CSV for downstream use

## :camera: Demo
Video demo: 
[![BDIViz Demo](https://img.youtube.com/vi/1eAbDicO0oXIbbVg56m3H8xdNDDsBGBLI/0.jpg)](https://drive.google.com/file/d/1RY3XjRmLIkBNjcZWkUZhG3vA-ZvPc6Ug/view?usp=drive_link)
<!-- [BDIViz Demo](https://drive.google.com/file/d/1eAbDicO0oXIbbVg56m3H8xdNDDsBGBLI/view?usp=drive_link) -->

Live Demo:
https://bdiviz.users.hsrn.nyu.edu/dashboard/

## :bookmark: Citation

If you use BDIViz in academic work, please cite the following paper:

```bibtex
@ARTICLE{wu2026bdiviz,
author={Wu, Eden and Turakhia, Dishita G and Wu, Guande and Koutras, Christos and Keegan, Sarah and Liu, Wenke and Szeitz, Beata and Fenyo, David and Silva, Claudio T. and Freire, Juliana},
journal={ IEEE Transactions on Visualization \& Computer Graphics },
title={{ BDIViz: An Interactive Visualization System for Biomedical Schema Matching with LLM-Powered Validation }},
year={2026},
volume={32},
number={01},
ISSN={1941-0506},
pages={1208-1218},
abstract={ Biomedical data harmonization is essential for enabling exploratory analyses and meta-studies, but the process of schema matching-identifying semantic correspondences between elements of disparate datasets (schemas)-remains a labor-intensive and error-prone task. Even state-of-the-art automated methods often yield low accuracy when applied to biomedical schemas due to the large number of attributes and nuanced semantic differences between them. We present BDIViz, a novel visual analytics system designed to streamline the schema matching process for biomedical data. Through formative studies with domain experts, we identified key requirements for an effective solution and developed interactive visualization techniques that address both scalability challenges and semantic ambiguity. BDIViz employs an ensemble approach that combines multiple matching methods with LLM-based validation, summarizes matches through interactive heatmaps, and provides coordinated views that enable users to quickly compare attributes and their values. Our method-agnostic design allows the system to integrate various schema matching algorithms and adapt to application-specific needs. Through two biomedical case studies and a within-subject user study with domain experts, we demonstrate that BDIViz significantly improves matching accuracy while reducing cognitive load and curation time compared to baseline approaches. },
keywords={Semantics;Data visualization;Bioinformatics;Accuracy;Visual analytics;Scalability;Graphical user interfaces;Cancer;Space heating;User centered design},
doi={10.1109/TVCG.2025.3634843},
url = {https://doi.ieeecomputersociety.org/10.1109/TVCG.2025.3634843},
publisher={IEEE Computer Society},
address={Los Alamitos, CA, USA},
month=jan}
```


<!-- ## :gear: Sequence Diagram
```mermaid

sequenceDiagram
    actor U as User
    box Lightyellow BDI-Viz
    participant B as React App
    participant S as Flask Server
    end

    U->>B: Input Source/Target csv
    B->>S: Request Schema Matching
    Note right of S: Default Model
    S->>B: Response Matching Candidates

    U->>B: Accept/Reject/Refine Matches
    B->>S: [Agent] Digest User Actions
    S->>B: [Agent] Possible Reasons
    Note left of B: Reason 1: Exact Match <br>Reason 2: Value Similarity <br>Reason 3: Prefix/Suffix Match <br>Reason 4: Synonym Match <br>Reason 5: etc.
    B->>U: What do you think is the best reason for this action?
    U->>B: Select Reason 3
    B->>S: [Agent] Update Model/Dataset
    Note right of S: FT Model 3
    S->>B: Response Matching Candidates
``` -->
