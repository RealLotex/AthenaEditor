# Authoring additions in 1.5

## Assets

Assets provides name search and an always-visible type selector. Images show
their texture and visible model cards render a thumbnail. Model previews share
a bounded cache and one rendering context. **+ Folder** creates persistent library
folders, including empty folders. Select an asset and change **Folder** in its
inspector to organize it. Library folders preserve export paths and assignments.

**Reimport** replaces contents while keeping the asset's identity, name, folder
and assignments. Choose the same file type; another original filename is allowed.
Undo restores the previous contents. A delayed read cannot replace an asset in
another project or revive one removed while reading.

The inspector lists uses throughout scenes, HUD, cinematics, visual events,
prefabs and the sequence library. Removing an in-use asset shows those references
and asks for confirmation. References remain visible as missing-resource errors
so they can be repaired. Removal and folder changes support Undo. Linked source
files stay on disk; library removal hides their external copies until restored
or imported again.

## Prefab variants

Save a selection through **Edit → Prefabs** or the Prefabs panel. Place a linked
instance, change its model, sounds, conditions or component values, and choose
**Save Selection as Prefab Variant**. The library's **Variant** button also creates
a variant from a prefab. Variants identify their base in the library and inspector.

**Save selection as prefab** updates the linked source. Its library name remains
stable when an instance is renamed. Changes propagate through derived variants
and every scene, retaining variant and instance overrides. Individual event
conditions/actions merge by stable ID. Internal references are remapped to the
placed instance's objects.

Instance names and root transforms remain local. Revert restores inherited
component values; unpack removes the link. Deleting a base detaches its ordinary
instances and keeps direct variants as independent prefabs with their current
contents. Undo restores the family. Missing bases and circular inheritance are
reported before propagation.

See [Visual events](EVENT-FLOWS.md) and [Cinematics](CINEMATICS.md).
