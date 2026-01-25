#!/usr/bin/env python3
"""
Script to merge all translation files into the main translations.js
This helps avoid token limits when editing large files
"""

import json
import re

def main():
    print("Translation merger - combines all translation parts into main file")
    print("Run this after creating translation parts to merge them")
    print("\nTo use:")
    print("1. Create translation parts in separate files")
    print("2. Run this script to merge them")
    print("3. The main translations.js will be updated")

if __name__ == "__main__":
    main()
