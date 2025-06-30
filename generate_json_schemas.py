#!/usr/bin/env python3
"""
Generate JSON Schema from Pydantic models in api/langchain/pydantic.py
"""

import json
import sys
import os
from pathlib import Path

# Add the api directory to Python path so we can import the pydantic models
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'api'))

try:
    from langchain.pydantic import (
        CandidateObject,
        DiagnoseObject, 
        AgentAction,
        AgentSuggestions,
        Explanation,
        RelevantKnowledge,
        SearchResponse,
        CandidateExplanation,
        SuggestedValueMappings,
        ActionResponse,
        TargetClusterInfo,
        TargetClusters,
        RelatedSource,
        RelatedSources,
        AttributeProperties,
        Ontology,
        AgentResponse,
        Candidate,
        AgentState
    )
except ImportError:
    print("Error: Could not import pydantic models. Make sure the api/langchain/pydantic.py file exists.")
    sys.exit(1)

def generate_schemas():
    """Generate JSON schemas for all Pydantic models"""
    
    models = {
        "CandidateObject": CandidateObject,
        "DiagnoseObject": DiagnoseObject,
        "AgentAction": AgentAction,
        "AgentSuggestions": AgentSuggestions,
        "Explanation": Explanation,
        "RelevantKnowledge": RelevantKnowledge,
        "SearchResponse": SearchResponse,
        "CandidateExplanation": CandidateExplanation,
        "SuggestedValueMappings": SuggestedValueMappings,
        "ActionResponse": ActionResponse,
        "TargetClusterInfo": TargetClusterInfo,
        "TargetClusters": TargetClusters,
        "RelatedSource": RelatedSource,
        "RelatedSources": RelatedSources,
        "AttributeProperties": AttributeProperties,
        "Ontology": Ontology,
        "AgentResponse": AgentResponse,
        "Candidate": Candidate,
        "AgentState": AgentState
    }
    
    schemas = {}
    
    for model_name, model_class in models.items():
        try:
            # Generate JSON schema using Pydantic v2 method
            if hasattr(model_class, 'model_json_schema'):
                schema = model_class.model_json_schema()
            else:
                # Fallback for Pydantic v1
                schema = model_class.schema()
            
            schemas[model_name] = schema
            print(f"✅ Generated schema for {model_name}")
            
        except Exception as e:
            print(f"❌ Error generating schema for {model_name}: {e}")
    
    return schemas

def save_schemas(schemas, output_file="pydantic_schemas.json"):
    """Save schemas to a JSON file"""
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(schemas, f, indent=2, ensure_ascii=False)
        print(f"\n📁 Schemas saved to {output_file}")
    except Exception as e:
        print(f"❌ Error saving schemas: {e}")

def save_individual_schemas(schemas, output_dir="schemas"):
    """Save each schema to individual JSON files"""
    try:
        Path(output_dir).mkdir(exist_ok=True)
        
        for model_name, schema in schemas.items():
            filename = f"{output_dir}/{model_name.lower()}_schema.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(schema, f, indent=2, ensure_ascii=False)
            print(f"📄 Saved {model_name} schema to {filename}")
            
    except Exception as e:
        print(f"❌ Error saving individual schemas: {e}")

if __name__ == "__main__":
    print("🔧 Generating JSON Schemas from Pydantic models...")
    print("=" * 50)
    
    schemas = generate_schemas()
    
    if schemas:
        print(f"\n✅ Successfully generated {len(schemas)} schemas")
        
        # Save all schemas in one file
        save_schemas(schemas)
        
        # Save individual schema files
        save_individual_schemas(schemas)
        
        print(f"\n🎉 Schema generation complete!")
        print(f"📊 Generated schemas for: {', '.join(schemas.keys())}")
    else:
        print("❌ No schemas were generated")
        sys.exit(1) 