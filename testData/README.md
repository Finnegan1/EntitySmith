# Knowledge Graph Test Data Set

This folder contains test data for the EntitySmith knowledge graph application.

## Structure

```
testData/
├── structured/          # Structured data sources
│   ├── csv/             # CSV files
│   ├── json/            # JSON files  
│   ├── sqlite/          # SQLite databases
│   └── mixed/           # Mixed format data
├── unstructured/        # Unstructured data sources
│   ├── markdown/        # Markdown documents
│   ├── pdf/             # PDF documents
│   └── web/             # Web content (URLs and HTML)
├── expected_output/     # Expected RDF/Turtle outputs
└── README.md            # This file
```

## Test Data Overview

### Structured Data

1. **CSV Files**: Customer, product, and order data in CSV format
2. **JSON Files**: User profiles and product catalogs in JSON format  
3. **SQLite Databases**: Sample databases with related tables
4. **Mixed Format**: Same conceptual data in different formats for cross-source testing

### Unstructured Data

1. **Markdown**: Documentation, meeting notes, and technical specs
2. **PDF**: Sample PDF documents with entity information
3. **Web**: HTML content and URLs for web scraping

### Expected Output

Pre-generated RDF/Turtle files showing expected knowledge graph output for validation.

## Usage

Use this test data to:
- Test source registration and profiling
- Validate connection proposal generation
- Test entity consolidation and merging
- Verify RDF export functionality
- Test unstructured data enrichment
- Validate cross-source matching algorithms

## Data Relationships

The test data is designed with intentional relationships:
- `users.csv` and `customers.json` represent the same entities (for merge testing)
- `orders.csv` contains foreign keys to both user formats
- `products.sqlite` has product data that appears in order line items
- Unstructured data contains references to entities in structured data

## Data Quality Issues

The test data includes intentional quality issues for testing:
- Duplicate records in `users_with_duplicates.csv`
- Missing values in various fields
- Inconsistent formatting (dates, names)
- Potential merge conflicts between sources
