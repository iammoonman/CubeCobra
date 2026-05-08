// Removed: the tag-data endpoint shipped a multi-MB Scryfall tag dictionary
// on every page load via FilterContext, which JSON.stringify'd the catalog
// dictionaries on every request and pegged main-server CPU. The otag/atag
// filters and Oracle/Art Tags sorts have been removed; this stub keeps the
// module exporting an empty `routes` so the auto-discovery loader still
// works without a 404-y handler.
export const routes: never[] = [];
