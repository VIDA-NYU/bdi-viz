interface MockApiResponses {
  [key: string]: object;
}

const mockApiResponses: MockApiResponses = {
  '/api/results': {
    "message": "success",
    "results": {
      "candidates": [
        {
          "sourceColumn": "Gender",
          "targetColumn": "gender",
          "score": 1,
          "matcher": "candidate_quadrants",
          "status": "accepted"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "age",
          "score": 1,
          "matcher": "candidate_quadrants",
          "status": "accepted"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "gender",
          "score": 1.0,
          "matcher": "magneto_ft",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "age",
          "score": 1.0,
          "matcher": "magneto_ft",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "gender",
          "score": 1.0,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "age",
          "score": 0.6522811651229858,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "age",
          "score": 1.0,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "gender",
          "score": 0.6423416137695312,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "gender",
          "score": 0.5304619073867798,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "age",
          "score": 0.43739035725593567,
          "matcher": "magneto_zs",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "age",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "gender",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "age",
          "score": 0.1333333333333333,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "age",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "gender",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "age",
          "score": 0.1333333333333333,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "age",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "gender",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "age",
          "score": 0.1333333333333333,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Gender",
          "targetColumn": "age",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "Age",
          "targetColumn": "gender",
          "score": 0.4444444444444444,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "targetColumn": "age",
          "score": 0.1333333333333333,
          "matcher": "RapidFuzzMatcher",
          "status": "idle"
        }
      ],
      "sourceClusters": [
        {
          "sourceColumn": "Gender",
          "cluster": ["Gender", "Age", "AJCC_Path_pT"]
        },
        {
          "sourceColumn": "Age",
          "cluster": ["Age", "Gender", "AJCC_Path_pT"]
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "cluster": ["AJCC_Path_pT", "Gender", "Age"]
        }
      ]
    }
  },
  '/api/value/bins': {
    "message": "success",
    "results": {
      "sourceUniqueValues": [
        {
          "sourceColumn": "Gender",
          "uniqueValues": ["Female", "Male"]
        },
        {
          "sourceColumn": "Age",
          "uniqueValues": ["70", "83"]
        },
        {
          "sourceColumn": "AJCC_Path_pT",
          "uniqueValues": ["pT2", "pTa1"]
        }
      ],
      "targetUniqueValues": [
        {
          "targetColumn": "gender",
          "uniqueValues": ["female", "male"]
        },
        {
          "targetColumn": "age",
          "uniqueValues": ["70", "83"]
        },
        {
          "targetColumn": "ajcc_pathologic_t",
          "uniqueValues": ["AI", "II"]
        }
      ]
    }
  },
  '/api/value/matches': {
    "message": "success",
    "results": [
      {
        "sourceColumn": "Gender",
        "sourceValues": ["Female", "Male"],
        "sourceMappedValues": ["female", "male"],
        "targets": [
          {
            "targetColumn": "gender",
            "targetValues": ["female", "male"]
          },
          {
            "targetColumn": "age",
            "targetValues": ["70", "83"]
          },
          {
            "targetColumn": "ajcc_pathologic_t",
            "targetValues": ["AI", "II"]
          }
        ]
      },
      {
        "sourceColumn": "Age",
        "sourceValues": ["70", "83"],
        "sourceMappedValues": ["70", "83"],
        "targets": [
          {
            "targetColumn": "gender",
            "targetValues": ["female", "male"]
          },
          {
            "targetColumn": "age",
            "targetValues": ["70", "83"]
          },
          {
            "targetColumn": "ajcc_pathologic_t",
            "targetValues": ["AI", "II"]
          }
        ]
      },
      {
        "sourceColumn": "AJCC_Path_pT",
        "sourceValues": ["pT2", "pTa1"],
        "sourceMappedValues": ["pT2", "pTa1"],
        "targets": [
          {
            "targetColumn": "gender",
            "targetValues": ["female", "male"]
          },
          {
            "targetColumn": "age",
            "targetValues": ["70", "83"]
          },
          {
            "targetColumn": "ajcc_pathologic_t",
            "targetValues": ["AI", "II"]
          }
        ]
      }
    ]
  },
  '/api/history': {
    "message": "success",
    "history": [
        {
            "operation": "accept",
            "candidate": {
                "sourceColumn": "Gender",
                "targetColumn": "gender",
                "score": 1,
                "matcher": "magneto_zs",
            }
        },
        {
            "operation": "reject",
            "candidate": {
                "sourceColumn": "AJCC_Path_pT",
                "targetColumn": "age",
                "score": 0.1333333333333333,
                "matcher": "RapidFuzzMatcher",
            }
        }
    ]
  },
  '/api/ontology/target': {
    "message": "success",
    "results": [
        {
            "name": "gender",
            "parent": "demographic",
            "grandparent": "clinical",
        },
        {
            "name": "age",
            "parent": "demographic",
            "grandparent": "clinical",
        },
        {
            "name": "ajcc_pathologic_t",
            "parent": "tumor",
            "grandparent": "clinical",
        }
    ]
  },
  '/api/ontology/source': {
    "message": "success",
    "results": [
        {
            "name": "Gender",
            "parent": "demographic",
            "grandparent": "demographic",
        },
        {
            "name": "Age",
            "parent": "demographic",
            "grandparent": "demographic",
        },
        {
            "name": "AJCC_Path_pT",
            "parent": "tumor",
            "grandparent": "tumor",
        }
    ]
  },
  '/api/matchers': {
    "message": "success",
    "matchers": [
        {
            "name": "magneto_ft",
            "weight": 0.3333333333333333,
            "params": {}
        },
        {
            "name": "magneto_zs",
            "weight": 0.3333333333333333,
            "params": {}
        },
        {
            "name": "RapidFuzzMatcher",
            "weight": 0.3333333333333333,
            "params": {
                "name": "RapidFuzzMatcher"
            },
            "code": "import RapidFuzz\n\ndef RapidFuzzMatcher(source_col, target_col):\n    return RapidFuzz.fuzz.ratio(source_col, target_col)"
        }
    ]
  }
};

const axiosMock: {
  post: jest.Mock;
  create: jest.Mock;
} = {
  post: jest.fn((url: string) => {
    const responseData = mockApiResponses[url] || {};
    return Promise.resolve({ data: responseData });
  }),
  create: jest.fn(() => axiosMock),
};

export default axiosMock; 