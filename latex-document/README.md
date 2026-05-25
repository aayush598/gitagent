GitAgent Fix Documentation - LaTeX Source
=========================================

This directory contains the LaTeX source for the comprehensive GitAgent fix
documentation, covering all 97+ fix branches created across the project.

Contents
--------
- main.tex                  - Main document entry point
- chapters/                 - Chapter files (one per category)
  - introduction.tex        - Project overview and methodology
  - chapter-bug.tex         - BUG-001 through BUG-035 (35 issues)
  - chapter-sec.tex         - SEC-001 through SEC-023 (16 issues)
  - chapter-err.tex         - ERR-001 through ERR-013 (13 issues)
  - chapter-race.tex        - RACE-001 through RACE-011 (11 issues)
  - chapter-type.tex        - TYPE-002 through TYPE-015 (14 issues)
  - chapter-net.tex         - NET-002, 005, 009, 010 (4 issues)
  - chapter-perf.tex        - PERF-001, 002 (2 issues)
  - chapter-conc.tex        - CONC-001, 002 (2 issues)
  - chapter-config.tex      - CONFIG-002, 004, 009, 010 (4 issues)
  - chapter-cq.tex          - CQ-012, 025 (2 issues)
  - chapter-dep.tex         - DEP-001/003, 004, 005 (3 sections)
  - chapter-file.tex        - FILE-007 (1 issue)
  - chapter-log.tex         - LOG-003, 006 (2 issues)
- appendix/                 - Appendix files
  - branch-summary.tex      - Complete branch reference table
- Makefile                  - Build automation

Prerequisites
-------------
- pdflatex (from texlive-latex-base and texlive-latex-extra)
- LaTeX packages: geometry, hyperref, xcolor, titlesec, fancyhdr,
  tocloft, appendix, enumitem, booktabs, longtable, caption,
  listings (all standard in texlive-latex-extra)

Building
--------
    cd latex-document
    make          # Builds the PDF
    make view     # Opens the PDF
    make clean    # Removes build artifacts

Output
------
The PDF will be generated as: gitagent-fix-documentation.pdf

Structure
---------
The document is organized as a LaTeX report with:
- Title page with project metadata
- Table of contents
- 13 category chapters, each covering related issues
- Appendix with complete branch summary table
- Each issue section includes: root cause, fix description, affected files
