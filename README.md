<h1 align="center">BDIViz: An Interactive Visualization System for Biomedical Schema Matching with LLM-Supported Validation</h2>

<div align="center">
  <a href="https://vida-nyu.github.io/bdi-viz-manual/">
    <img src="https://img.shields.io/badge/User%20Manual-Read%20the%20Docs-blue?style=for-the-badge&logo=read-the-docs" alt="User Manual" />
  </a>
</div>


## Table of Contents

* [1. Environment Setup](#gear-getting-started)
* [2. Introduction](#gear-introduction)
* [3. Features](#gear-features)
* [4. Demo](#camera-demo)


## :gear: Getting Started

First, install the required dependencies:

```bash
npm i .
```


Then, run the development server:

```bash
npm run dev
```

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
https://bdiviz-dev.users.hsrn.nyu.edu/dashboard/


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