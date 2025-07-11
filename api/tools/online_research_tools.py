import json
import logging
import re
import time
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from langchain.tools.base import StructuredTool
from pydantic import BaseModel, Field

logger = logging.getLogger("bdiviz_flask.sub")


class OnlineResearchTools:
    """Tools for online research and dataset discovery."""

    def __init__(self, session_id: str = "default"):
        self.session_id = session_id
        self.headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/91.0.4472.124 Safari/537.36"
            )
        }

    def get_tools(self) -> List[StructuredTool]:
        """Return all online research tools."""
        return [
            self.search_for_dataset_tool,
            self.search_pubmed_datasets_tool,
            self.search_biostudies_tool,
            self.search_figshare_tool,
            self.search_zenodo_tool,
        ]

    @property
    def search_for_dataset_tool(self) -> StructuredTool:
        """Tool to search for datasets across multiple academic sources."""

        class SearchForDatasetInput(BaseModel):
            query: str = Field(
                description="The search query for datasets "
                "(e.g., 'cancer genomics', 'climate data')"
            )
            sources: Optional[List[str]] = Field(
                default=["all"],
                description="List of sources to search: 'pubmed', 'biostudies', "
                "'figshare', 'zenodo', 'google_scholar', or 'all'",
            )
            limit: int = Field(
                default=10, description="Maximum number of results per source"
            )

        def _search_for_dataset(
            query: str, sources: Optional[List[str]] = None, limit: int = 10
        ) -> str:
            if sources is None or "all" in sources:
                sources = ["pubmed", "biostudies", "figshare", "zenodo"]

            all_results = []

            for source in sources:
                try:
                    if source == "pubmed":
                        results = self._search_pubmed_datasets(query, limit)
                    elif source == "biostudies":
                        results = self._search_biostudies_datasets(query, limit)
                    elif source == "figshare":
                        results = self._search_figshare_datasets(query, limit)
                    elif source == "zenodo":
                        results = self._search_zenodo_datasets(query, limit)
                    else:
                        continue

                    for result in results:
                        result["source"] = source
                    all_results.extend(results)

                    # Be respectful with API calls
                    time.sleep(1)

                except Exception as e:
                    logger.error(f"Error searching {source}: {str(e)}")
                    continue

            # Sort by relevance score if available
            all_results.sort(key=lambda x: x.get("relevance_score", 0), reverse=True)

            summary = {
                "query": query,
                "total_results": len(all_results),
                "sources_searched": sources,
                "datasets": all_results[: limit * len(sources)],
            }

            return json.dumps(summary, indent=2)

        return StructuredTool.from_function(
            func=_search_for_dataset,
            name="search_for_dataset",
            description=(
                "Search for academic datasets across multiple sources including "
                "PubMed, BioStudies, Figshare, and Zenodo. "
                "Returns downloadable URLs when available."
            ),
            args_schema=SearchForDatasetInput,
        )

    @property
    def search_pubmed_datasets_tool(self) -> StructuredTool:
        """Tool to search for datasets specifically in PubMed."""

        class SearchPubMedInput(BaseModel):
            query: str = Field(description="The search query for PubMed datasets")
            limit: int = Field(default=10, description="Maximum number of results")

        def _search_pubmed_datasets(query: str, limit: int = 10) -> str:
            results = self._search_pubmed_datasets(query, limit)
            return json.dumps(
                {
                    "source": "pubmed",
                    "query": query,
                    "total_results": len(results),
                    "datasets": results,
                },
                indent=2,
            )

        return StructuredTool.from_function(
            func=_search_pubmed_datasets,
            name="search_pubmed_datasets",
            description="Search for datasets specifically in PubMed database.",
            args_schema=SearchPubMedInput,
        )

    @property
    def search_biostudies_tool(self) -> StructuredTool:
        """Tool to search for datasets in BioStudies."""

        class SearchBioStudiesInput(BaseModel):
            query: str = Field(description="The search query for BioStudies datasets")
            limit: int = Field(default=10, description="Maximum number of results")

        def _search_biostudies_datasets(query: str, limit: int = 10) -> str:
            results = self._search_biostudies_datasets(query, limit)
            return json.dumps(
                {
                    "source": "biostudies",
                    "query": query,
                    "total_results": len(results),
                    "datasets": results,
                },
                indent=2,
            )

        return StructuredTool.from_function(
            func=_search_biostudies_datasets,
            name="search_biostudies_datasets",
            description="Search for datasets in BioStudies database.",
            args_schema=SearchBioStudiesInput,
        )

    @property
    def search_figshare_tool(self) -> StructuredTool:
        """Tool to search for datasets in Figshare."""

        class SearchFigshareInput(BaseModel):
            query: str = Field(description="The search query for Figshare datasets")
            limit: int = Field(default=10, description="Maximum number of results")

        def _search_figshare_datasets(query: str, limit: int = 10) -> str:
            results = self._search_figshare_datasets(query, limit)
            return json.dumps(
                {
                    "source": "figshare",
                    "query": query,
                    "total_results": len(results),
                    "datasets": results,
                },
                indent=2,
            )

        return StructuredTool.from_function(
            func=_search_figshare_datasets,
            name="search_figshare_datasets",
            description="Search for datasets in Figshare repository.",
            args_schema=SearchFigshareInput,
        )

    @property
    def search_zenodo_tool(self) -> StructuredTool:
        """Tool to search for datasets in Zenodo."""

        class SearchZenodoInput(BaseModel):
            query: str = Field(description="The search query for Zenodo datasets")
            limit: int = Field(default=10, description="Maximum number of results")

        def _search_zenodo_datasets(query: str, limit: int = 10) -> str:
            results = self._search_zenodo_datasets(query, limit)
            return json.dumps(
                {
                    "source": "zenodo",
                    "query": query,
                    "total_results": len(results),
                    "datasets": results,
                },
                indent=2,
            )

        return StructuredTool.from_function(
            func=_search_zenodo_datasets,
            name="search_zenodo_datasets",
            description="Search for datasets in Zenodo repository.",
            args_schema=SearchZenodoInput,
        )

    # Implementation methods for each data source

    def _search_pubmed_datasets(
        self, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search PubMed for datasets."""
        try:
            # PubMed E-utilities API
            base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
            params = {
                "db": "pubmed",
                "term": f"{query}",
                "retmax": limit,
                "retmode": "json",
                "usehistory": "y",
            }

            response = requests.get(
                base_url, params=params, headers=self.headers, timeout=10
            )
            if response.status_code != 200:
                return []

            data = response.json()
            pmids = data.get("esearchresult", {}).get("idlist", [])

            if not pmids:
                return []

            # Get detailed information for each PMID
            details_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"
            details_params = {"db": "pubmed", "id": ",".join(pmids), "retmode": "json"}

            details_response = requests.get(
                details_url, params=details_params, headers=self.headers, timeout=10
            )
            if details_response.status_code != 200:
                return []

            details_data = details_response.json()
            results = []

            for pmid in pmids:
                if pmid in details_data.get("result", {}):
                    article = details_data["result"][pmid]
                    result = {
                        "title": article.get("title", ""),
                        "authors": ", ".join(
                            [
                                author.get("name", "")
                                for author in article.get("authors", [])
                            ]
                        ),
                        "journal": article.get("fulljournalname", ""),
                        "pub_date": article.get("pubdate", ""),
                        "pmid": pmid,
                        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        "abstract_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        "data_availability": "Check full text for data availability",
                        "relevance_score": 0.8,
                    }
                    results.append(result)

            return results

        except Exception as e:
            logger.error(f"Error searching PubMed: {str(e)}")
            return []

    def _search_biostudies_datasets(
        self, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search BioStudies for datasets."""
        try:
            # BioStudies API
            base_url = "https://www.ebi.ac.uk/biostudies/api/v1/search"
            params = {"query": query, "pageSize": limit, "page": 1}

            response = requests.get(
                base_url, params=params, headers=self.headers, timeout=10
            )
            if response.status_code != 200:
                return []

            data = response.json()
            results = []

            for hit in data.get("hits", []):
                study = hit.get("_source", {})
                accession = study.get("accession", "")

                result = {
                    "title": study.get("title", ""),
                    "description": (
                        study.get("description", "")[:200] + "..."
                        if study.get("description", "")
                        else ""
                    ),
                    "accession": accession,
                    "authors": ", ".join(study.get("authors", [])),
                    "release_date": study.get("releaseDate", ""),
                    "url": f"https://www.ebi.ac.uk/biostudies/studies/{accession}",
                    "download_url": f"https://www.ebi.ac.uk/biostudies/files/{accession}",
                    "data_type": study.get("type", ""),
                    "relevance_score": hit.get("_score", 0) / 100,  # Normalize score
                }
                results.append(result)

            return results

        except Exception as e:
            logger.error(f"Error searching BioStudies: {str(e)}")
            return []

    def _search_figshare_datasets(
        self, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search Figshare for datasets."""
        try:
            # Figshare API
            base_url = "https://api.figshare.com/v2/articles/search"
            payload = {
                "search_for": query,
                "item_type": 3,  # Dataset type
                "page_size": limit,
            }

            response = requests.post(
                base_url, json=payload, headers=self.headers, timeout=10
            )
            if response.status_code != 200:
                return []

            data = response.json()
            results = []

            for article in data:
                result = {
                    "title": article.get("title", ""),
                    "description": (
                        article.get("description", "")[:200] + "..."
                        if article.get("description", "")
                        else ""
                    ),
                    "authors": ", ".join(
                        [
                            author.get("full_name", "")
                            for author in article.get("authors", [])
                        ]
                    ),
                    "published_date": article.get("published_date", ""),
                    "doi": article.get("doi", ""),
                    "url": article.get("url", ""),
                    "download_url": article.get("download_url", ""),
                    "files": [
                        {
                            "name": f.get("name", ""),
                            "download_url": f.get("download_url", ""),
                        }
                        for f in article.get("files", [])
                    ],
                    "size": article.get("size", 0),
                    "views": article.get("views", 0),
                    "downloads": article.get("downloads", 0),
                    "relevance_score": 0.7,
                }
                results.append(result)

            return results

        except Exception as e:
            logger.error(f"Error searching Figshare: {str(e)}")
            return []

    def _search_zenodo_datasets(
        self, query: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search Zenodo for datasets."""
        try:
            # Zenodo API
            base_url = "https://zenodo.org/api/records"
            params = {
                "q": f"{query} AND type:dataset",
                "size": limit,
                "sort": "mostrecent",
            }

            response = requests.get(
                base_url, params=params, headers=self.headers, timeout=10
            )
            if response.status_code != 200:
                return []

            data = response.json()
            results = []

            for record in data.get("hits", {}).get("hits", []):
                metadata = record.get("metadata", {})

                files = []
                for file_info in record.get("files", []):
                    files.append(
                        {
                            "filename": file_info.get("key", ""),
                            "size": file_info.get("size", 0),
                            "download_url": file_info.get("links", {}).get("self", ""),
                        }
                    )

                result = {
                    "title": metadata.get("title", ""),
                    "description": (
                        metadata.get("description", "")[:200] + "..."
                        if metadata.get("description", "")
                        else ""
                    ),
                    "creators": ", ".join(
                        [
                            creator.get("name", "")
                            for creator in metadata.get("creators", [])
                        ]
                    ),
                    "publication_date": metadata.get("publication_date", ""),
                    "doi": record.get("doi", ""),
                    "url": record.get("links", {}).get("html", ""),
                    "files": files,
                    "access_right": metadata.get("access_right", ""),
                    "license": metadata.get("license", {}).get("id", ""),
                    "keywords": metadata.get("keywords", []),
                    "relevance_score": 0.8,
                }
                results.append(result)

            return results

        except Exception as e:
            logger.error(f"Error searching Zenodo: {str(e)}")
            return []

    def _extract_download_urls(self, html_content: str, base_url: str) -> List[str]:
        """Extract potential download URLs from HTML content."""
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            download_urls = []

            # Look for common download link patterns
            download_patterns = [
                r'href=["\']([^"\']*\.(?:csv|xlsx?|json|xml|zip|tar\.gz|txt|tsv))["\']',
                r'href=["\']([^"\']*download[^"\']*)["\']',
                r'href=["\']([^"\']*data[^"\']*)["\']',
            ]

            for pattern in download_patterns:
                matches = re.findall(pattern, html_content, re.IGNORECASE)
                for match in matches:
                    if match.startswith("http"):
                        download_urls.append(match)
                    else:
                        download_urls.append(urljoin(base_url, match))

            return list(set(download_urls))  # Remove duplicates

        except Exception as e:
            logger.error(f"Error extracting download URLs: {str(e)}")
            return []
