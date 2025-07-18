interface MockApiResponses {
  [key: string]: object;
}

const mockApiResponses: MockApiResponses = {
  '/api/results': {
    "message": "success",
    "results": {
        "candidates": [],
        "sourceClusters": []
    }
  },
  '/api/value/bins': {
    "message": "success",
    "results": {
        "sourceUniqueValues": [],
        "targetUniqueValues": []
    }
  },
  '/api/value/matches': {"message": "success", "results": []},
  '/api/history': {
    "message": "success",
    "history": [],
  },
  '/api/ontology/target': {
    "message": "success",
    "results": [],
  },
  '/api/ontology/source': {
    "message": "success",
    "results": [],
  },
  '/api/matchers': {
    "message": "success",
    "matchers": [],
  },
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