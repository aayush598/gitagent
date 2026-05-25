# LaTeX build for GitAgent Fix Documentation
# Requires: pdflatex (texlive-latex-base, texlive-latex-extra)

PDF = gitagent-fix-documentation.pdf
MAIN = main.tex
LATEX = pdflatex
LATEXFLAGS = -interaction=nonstopmode -halt-on-error

CHAPTERS = $(wildcard chapters/*.tex)
APPENDIX = $(wildcard appendix/*.tex)

.PHONY: all clean build view

all: build

build: $(PDF)

$(PDF): $(MAIN) $(CHAPTERS) $(APPENDIX)
	$(LATEX) $(LATEXFLAGS) $(MAIN)
	$(LATEX) $(LATEXFLAGS) $(MAIN)

view: $(PDF)
	xdg-open $(PDF) 2>/dev/null || open $(PDF) 2>/dev/null || echo "Open $(PDF) manually"

clean:
	rm -f *.aux *.log *.out *.toc *.lof *.lot *.fls *.fdb_latexmk
	rm -f chapters/*.aux appendix/*.aux

distclean: clean
	rm -f $(PDF)
