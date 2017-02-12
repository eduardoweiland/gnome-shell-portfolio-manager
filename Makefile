#!/usr/bin/make -f

SOURCES := extension.js prefs.js convenience.js
LOCALES := $(patsubst po/%.po, \
                      locale/%/LC_MESSAGES/gnome-shell-portfolio-manager.mo, \
					  $(wildcard po/*.po))

all: gnome-shell-portfolio-manager.zip

po/messages.pot: $(SOURCES)
	xgettext -j --add-location=file -o $@ $?

locale/%/LC_MESSAGES/gnome-shell-portfolio-manager.mo: po/%.po
	mkdir -p $(dir $@)
	msgfmt -c -o $@ $?

gnome-shell-portfolio-manager.zip: $(LOCALES) schemas/gschemas.compiled
	zip -r $@ $? metadata.json stylesheet.css $(SOURCES)

schemas/gschemas.compiled: $(wildcard schemas/*.gschema.xml)
	glib-compile-schemas schemas

