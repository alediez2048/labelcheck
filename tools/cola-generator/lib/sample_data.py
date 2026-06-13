"""Pool of label-side values for variety: brands, beverage types, origins, ABVs.

Used to sample a synthetic label spec without hardcoding the same brand every time.
Pool is intentionally diverse across beverage types (wine, spirits, malt) so the
generated test set exercises specialist routing.
"""

# (brand, fanciful_name, class_type, origin, abv, net_contents)
WINE_SPECS = [
    ("HARBOR MIST", "Coastal White", "TABLE WINE", "California", "12.5%", "750 ML"),
    ("CEDAR RIDGE", "Reserve", "RED TABLE WINE", "Washington", "13.5%", "750 ML"),
    ("NORTH POINT", "Pinot Noir", "RED TABLE WINE", "Oregon", "13.8%", "750 ML"),
    ("TOMASELLO", "", "TABLE RED WINE", "New Jersey", "12.0%", "750 ML"),
    ("VIEJO TONEL", "", "RED WINE", "Argentina", "13.0%", "750 ML"),
    ("BENANTI", "Etna Bianco", "WHITE WINE", "Italy", "12.5%", "750 ML"),
]

SPIRITS_SPECS = [
    ("OLD CEDAR", "", "KENTUCKY STRAIGHT BOURBON", "Kentucky", "45%", "750 ML"),
    ("OLD CEDAR", "", "RYE WHISKEY", "Indiana", "47%", "750 ML"),
    ("IRON GATE", "", "LONDON DRY GIN", "New York", "40%", "750 ML"),
    ("SILVER BRANCH", "", "VODKA", "Texas", "40%", "750 ML"),
    ("DUNMORE", "", "SINGLE MALT WHISKY", "Virginia", "43%", "700 ML"),
    ("WOODFORD RESERVE", "", "KENTUCKY STRAIGHT BOURBON", "Kentucky", "45.2%", "750 ML"),
    ("MONKEY 47", "", "DRY GIN", "Germany", "47%", "500 ML"),
    ("CASAMIGOS", "Blanco", "TEQUILA", "Mexico", "40%", "750 ML"),
    ("BLACK MAPLE HILL", "", "BOURBON WHISKEY", "Kentucky", "47%", "750 ML"),
]

MALT_SPECS = [
    ("COASTAL", "Pale Ale", "MALT BEVERAGE", "Maine", "5.2%", "12 FL OZ"),
    ("STONE'S THROW", "", "AMERICAN PALE ALE", "Oregon", "5.6%", "12 FL OZ"),
    ("PAGES 1907", "Lager", "MALT BEVERAGE", "Wisconsin", "4.8%", "12 FL OZ"),
    ("HOWLING MOON", "IPA", "MALT BEVERAGE", "Colorado", "6.5%", "16 FL OZ"),
    ("SEVEN FATHOMS", "", "MALT BEVERAGE", "Cayman Islands", "5.0%", "12 FL OZ"),
]

ALL_SPECS = WINE_SPECS + SPIRITS_SPECS + MALT_SPECS


def pick_spec(rng) -> dict:
    """Sample one label spec from the pool using the provided random.Random."""
    brand, fanciful, type_, origin, abv, net = rng.choice(ALL_SPECS)
    return {
        "brand": brand,
        "fanciful": fanciful,
        "class_type": type_,
        "origin": origin,
        "abv": abv,
        "net_contents": net,
    }


def alter_abv(label_abv: str) -> str:
    """Return an ABV value that visibly differs from the label-side ABV."""
    # 45% → 40%; 13.5% → 12.5%; 5.6% → 5.0%. Drop by a clearly different number.
    n = float(label_abv.rstrip("%").strip())
    if n >= 35:
        return "%g%%" % (n - 5)
    if n >= 10:
        return "%g%%" % (n - 1)
    return "%g%%" % (n - 0.5)


def alter_net(label_net: str) -> str:
    """Return a net contents value that visibly differs from the label-side value."""
    pairs = {
        "750 ML": "375 ML",
        "375 ML": "750 ML",
        "700 ML": "1.0 L",
        "500 ML": "750 ML",
        "1.0 L": "750 ML",
        "12 FL OZ": "16 FL OZ",
        "16 FL OZ": "12 FL OZ",
    }
    return pairs.get(label_net.strip().upper(), "375 ML")


def alter_brand(label_brand: str) -> str:
    """Return a brand name that visibly differs from the label-side brand."""
    # Simple swap pool — pick a brand that isn't this one.
    pool = [s[0] for s in ALL_SPECS if s[0] != label_brand]
    return pool[hash(label_brand) % len(pool)] if pool else "OLD CHERRY"
