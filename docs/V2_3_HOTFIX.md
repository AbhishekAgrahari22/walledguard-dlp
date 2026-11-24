# v2.3 blue text leaf hotfix

The previous implementation colored `.markdown` / `.prose` blocks when
found, but did not always color answer text in sibling elements inside the
assistant turn. The controller diagnostic sampled one element and could
report blue even while other visible text was black.

This hotfix always colors the whole known assistant turn, excluding action
buttons/toolbars and user input. It counts visible colored and non-blue text
leaves without collecting prompt or response contents.

This is a targeted robustness improvement, not proof of visual rendering on
the current live sites. Test on your Mac.
