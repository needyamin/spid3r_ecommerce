#!/usr/bin/env python3
"""Spid3r demo data seeder (SQLite).

Usage:
    python tools/seed_demo_data.py            # seed demo catalog + orders
    python tools/seed_demo_data.py --status   # show current row counts only

Idempotent-ish: refuses to run if demo products already exist (use --force to reseed).
"""
import sqlite3
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "database", "database.sqlite")
IMG_DIR = os.path.join(ROOT, "public", "images", "products")

NOW = "datetime('now')"


def slugify(name):
    return (name.lower()
            .replace("&", "and")
            .replace('"', "")
            .replace("'", "")
            .replace(" ", "-")
            .replace(".", ""))


# --- palette for flat product cover SVGs (matches store.css tokens) ---------
PALETTE = [
    ("#fff1e8", "#c2410c"),  # accent
    ("#eef4ff", "#1d4ed8"),
    ("#ecfdf5", "#047857"),
    ("#fdf4ff", "#a21caf"),
    ("#fffbeb", "#b45309"),
    ("#f1f5f9", "#475569"),
]


def cover_svg(name, idx):
    bg, fg = PALETTE[idx % len(PALETTE)]
    initials = "".join(w[0] for w in name.split()[:2]).upper()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" rx="24" fill="{bg}"/>
  <circle cx="200" cy="168" r="86" fill="none" stroke="{fg}" stroke-width="10" opacity="0.25"/>
  <text x="200" y="205" font-family="system-ui, -apple-system, Segoe UI, Arial, sans-serif"
        font-size="96" font-weight="700" fill="{fg}" text-anchor="middle" opacity="0.85">{initials}</text>
  <text x="200" y="330" font-family="system-ui, -apple-system, Segoe UI, Arial, sans-serif"
        font-size="22" font-weight="600" fill="{fg}" text-anchor="middle" opacity="0.75">{name}</text>
</svg>
"""


def main():
    force = "--force" in sys.argv
    status_only = "--status" in sys.argv
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    if status_only:
        for t in ["categories", "brands", "products", "product_variants",
                  "product_images", "inventory", "orders", "order_items", "payments"]:
            n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"{t}: {n}")
        return

    existing = con.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if existing and not force:
        print(f"products table already has {existing} rows. Use --force to reseed.")
        return
    if force:
        # wipe demo catalog + demo orders (fresh reseed)
        for t in ["order_items", "payments", "shipments", "orders",
                  "inventory", "product_images", "product_variants", "products",
                  "brands", "categories"]:
            con.execute(f"DELETE FROM {t}")
        print("cleared existing catalog/order rows (--force)")

    # --- 1. remove legacy test-junk categories ------------------------------
    junk = con.execute(
        "SELECT id FROM categories WHERE name LIKE 'Panel Redirect%'").fetchall()
    if junk:
        con.execute("DELETE FROM categories WHERE name LIKE 'Panel Redirect%'")
        print(f"removed {len(junk)} legacy test categories")

    ts = f"{NOW}, {NOW}"

    # --- 2. categories -------------------------------------------------------
    cats = [
        ("Electronics", "phones, tablets and everyday tech"),
        ("Audio", "headphones, earbuds and speakers"),
        ("Wearables", "smartwatches and fitness bands"),
        ("Computing", "keyboards, mice and desk gear"),
        ("Accessories", "chargers, cables and cases"),
        ("Home & Living", "cozy upgrades for your space"),
        ("Fitness", "training and recovery essentials"),
        ("Gaming", "play-ready gear"),
    ]
    for i, (name, desc) in enumerate(cats):
        con.execute(
            "INSERT INTO categories (parent_id,name,slug,description,sort_order,is_active,"
            "created_at,updated_at) VALUES (NULL,?,?,?,0,1," + ts + ")",
            (name, slugify(name), desc))
    cat_ids = {r["name"]: r["id"] for r in
               con.execute("SELECT id,name FROM categories").fetchall()}

    # --- 3. brands -----------------------------------------------------------
    brands = [
        ("SpiderTech", "house brand — honest specs, fair prices"),
        ("NovaSound", "audio tuned for the daily commute"),
        ("PixelHub", "cameras and creative tools"),
        ("UrbanCarry", "bags built for city life"),
        ("LumoLife", "small comforts for desk and home"),
        ("VoltEdge", "charging that keeps up"),
        ("Craft&Co", "everyday objects, made well"),
        ("AeroFit", "move more, track better"),
    ]
    for name, desc in brands:
        con.execute(
            "INSERT INTO brands (name,slug,description,is_active,created_at,updated_at) "
            "VALUES (?,?,?,1," + ts + ")",
            (name, slugify(name), desc))
    brand_ids = {r["name"]: r["id"] for r in
                 con.execute("SELECT id,name FROM brands").fetchall()}

    # --- 4. products (price in BDT minor units) ------------------------------
    P = [
        # name, category, brand, price, compare_at, short_desc, featured, status
        ("NovaSound Pro ANC Headphones", "Audio", "NovaSound", 850000, 999000,
         "Active noise cancelling, 40h battery, USB-C fast charge.", 1, "published"),
        ("NovaBuds Air Wireless Earbuds", "Audio", "NovaSound", 329000, 399000,
         "Feather-light buds with punchy bass and 26h case battery.", 1, "published"),
        ("SpiderTech X5 Smartphone 128GB", "Electronics", "SpiderTech", 2799900, 2999900,
         "6.6\" 120Hz display, 5000mAh battery, dual SIM.", 1, "published"),
        ("SpiderTech Tab 10 Tablet", "Electronics", "SpiderTech", 1899900, None,
         "10.1\" FHD tablet with folio keyboard support.", 0, "published"),
        ("VoltEdge 65W GaN Charger", "Accessories", "VoltEdge", 245000, None,
         "Two USB-C + one USB-A, pocket-sized 65W GaN.", 0, "published"),
        ("VoltEdge Power Bank 20000mAh", "Accessories", "VoltEdge", 219000, 259000,
         "22.5W fast output, airline-safe capacity.", 1, "published"),
        ("PixelHub 4K Action Cam", "Electronics", "PixelHub", 649000, None,
         "4K60 with stabilisation, waterproof case included.", 0, "published"),
        ("PixelHub Smart Doorbell Cam", "Electronics", "PixelHub", 429000, None,
         "2K video, motion alerts, works on 2.4GHz Wi-Fi.", 0, "published"),
        ("AeroFit Band 5 Fitness Tracker", "Wearables", "AeroFit", 289000, 349000,
         "Heart rate, SpO2, 14-day battery.", 0, "published"),
        ("AeroFit GPS Smartwatch", "Wearables", "AeroFit", 549000, None,
         "Built-in GPS, AMOLED display, 5ATM water resistance.", 1, "published"),
        ("UrbanCarry Everyday Backpack 25L", "Accessories", "UrbanCarry", 189000, None,
         "Padded 16\" laptop sleeve, water-repellent shell.", 0, "published"),
        ("UrbanCarry Laptop Sleeve 14\"", "Accessories", "UrbanCarry", 99000, None,
         "Shock-absorbing liner with a slim front pocket.", 0, "published"),
        ("LumoLife LED Desk Lamp", "Home & Living", "LumoLife", 129000, None,
         "Stepless dimming, three colour modes, USB powered.", 0, "published"),
        ("LumoLife Mug Warmer", "Home & Living", "LumoLife", 79000, None,
         "Keeps coffee at 55°C all morning.", 0, "published"),
        ("Craft&Co Ceramic Mug Set", "Home & Living", "Craft&Co", 89000, None,
         "Set of two 350ml stoneware mugs.", 0, "published"),
        ("Craft&Co Bamboo Desk Organizer", "Home & Living", "Craft&Co", 119000, None,
         "Five compartments of warm bamboo tidiness.", 0, "published"),
        ("SpiderTech TKL Mechanical Keyboard", "Computing", "SpiderTech", 459000, 529000,
         "Hot-swappable red switches, PBT keycaps.", 1, "published"),
        ("SpiderTech Ergo Wireless Mouse", "Computing", "SpiderTech", 159000, None,
         "Silent clicks, 4000 DPI, dual-device Bluetooth.", 0, "published"),
        ("VoltEdge Braided USB-C Cable 2m", "Accessories", "VoltEdge", 49000, None,
         "100W rated, 10,000-bend lifespan.", 0, "published"),
        ("AeroFit Yoga Mat 6mm", "Fitness", "AeroFit", 139000, None,
         "Non-slip TPE with alignment lines and carry strap.", 0, "published"),
        ("NovaSound Party Speaker 20W", "Audio", "NovaSound", 389000, 449000,
         "IPX6, 12h playtime, dual pairing.", 0, "published"),
        ("PixelHub Stream Webcam 1080p", "Computing", "PixelHub", 219000, None,
         "1080p60 with privacy shutter and ring-light clip.", 0, "published"),
        ("LumoLife Aroma Diffuser", "Home & Living", "LumoLife", 149000, None,
         "300ml ultrasonic mist with soft ambient light.", 0, "draft"),
        ("Craft&Co Cotton Tote Bag", "Accessories", "Craft&Co", 69000, None,
         "12oz heavyweight canvas, screen-printed logo.", 0, "draft"),
    ]

    VARIED = {  # name -> [(variant name, attrs, price_delta)]
        "NovaSound Pro ANC Headphones": [
            ("Midnight Black", {"color": "Midnight Black"}, 0),
            ("Silver Sky", {"color": "Silver Sky"}, 20000),
        ],
        "UrbanCarry Everyday Backpack 25L": [
            ("Charcoal", {"color": "Charcoal"}, 0),
            ("Olive", {"color": "Olive"}, 0),
            ("Storm Blue", {"color": "Storm Blue"}, 10000),
        ],
        "SpiderTech TKL Mechanical Keyboard": [
            ("Red Switch", {"switch": "Red"}, 0),
            ("Brown Switch", {"switch": "Brown"}, 0),
        ],
    }

    stock_pool = [180, 64, 42, 27, 15, 120, 88, 33, 55, 9, 71, 140, 24, 46, 60, 12, 95, 38, 200, 18, 67, 80, 5, 150]

    for idx, (name, cat, brand, price, cmp_at, short, featured, status) in enumerate(P):
        slug = slugify(name)
        sku = ("SPD-" + str(1000 + idx))
        cur = con.execute(
            "INSERT INTO products (category_id,brand_id,name,slug,sku,short_description,description,"
            "price_minor,compare_at_minor,cost_minor,currency,tax_rate_bps,status,is_featured,"
            "weight_grams,meta_title,meta_description,created_at,updated_at) "
            f"VALUES (?,?,?,?,?,?,?,{price},{cmp_at or 'NULL'},?,'BDT',0,?,?,?,?,?," + ts + ")",
            (cat_ids[cat], brand_ids[brand], name, slug, sku, short,
             short + " Part of the Spid3r demo catalog — quality checked, warranty included.",
             round(price * 0.72), status, featured, 250 + idx * 35,
             name, short))
        pid = cur.lastrowid

        # cover image (flat SVG, written to public/images/products/)
        os.makedirs(IMG_DIR, exist_ok=True)
        svg_path = f"/images/products/{slug}.svg"
        with open(os.path.join(IMG_DIR, slug + ".svg"), "w", encoding="utf-8") as f:
            f.write(cover_svg(name, idx))
        con.execute(
            "INSERT INTO product_images (product_id,path,alt_text,sort_order,is_primary,"
            "created_at,updated_at) VALUES (?,?,?,0,1," + ts + ")", (pid, svg_path, name))

        # variants
        if name in VARIED:
            for vname, attrs, delta in VARIED[name]:
                con.execute(
                    "INSERT INTO product_variants (product_id,sku,name,attributes_json,price_minor,"
                    "compare_at_minor,is_active,created_at,updated_at) VALUES (?,?,?,?,?,NULL,1," + ts + ")",
                    (pid, f"{sku}-{slugify(vname)[:8].upper()}", vname,
                     __import__("json").dumps(attrs), price + delta))
            qty = stock_pool[idx]
            con.execute(
                "INSERT INTO inventory (product_id,variant_id,quantity,reserved,low_stock_threshold,"
                "created_at,updated_at) VALUES (?,NULL,?,0,10," + ts + ")", (pid, qty))
        else:
            qty = stock_pool[idx]
            con.execute(
                "INSERT INTO inventory (product_id,variant_id,quantity,reserved,low_stock_threshold,"
                "created_at,updated_at) VALUES (?,NULL,?,0,10," + ts + ")", (pid, qty))

    products = {r["name"]: r for r in con.execute(
        "SELECT id,name,sku,price_minor FROM products").fetchall()}

    # --- 5. demo orders (attached to the demo customer) ----------------------
    cust = con.execute(
        "SELECT id FROM users WHERE email LIKE 'journey-%' LIMIT 1").fetchone()
    if not cust:
        cust = con.execute("SELECT id FROM users LIMIT 1").fetchone()
    uid = cust["id"]
    con.execute("UPDATE users SET name='Demo Customer' WHERE id=?", (uid,))

    addr = ('{"name":"Demo Customer","phone":"+8801700000000",'
            '"line1":"House 12, Road 5, Dhanmondi","city":"Dhaka","area":"Dhanmondi",'
            '"postal_code":"1205","country":"BD"}')

    ORDERS = [
        # (days_ago, status, [(product, qty)], provider, ship)
        (28, "delivered", [("NovaSound Pro ANC Headphones", 1), ("VoltEdge Braided USB-C Cable 2m", 2)], "bkash", 6000),
        (19, "delivered", [("AeroFit GPS Smartwatch", 1)], "cod", 0),
        (11, "shipped", [("SpiderTech TKL Mechanical Keyboard", 1), ("SpiderTech Ergo Wireless Mouse", 1)], "bkash", 6000),
        (6, "processing", [("NovaBuds Air Wireless Earbuds", 1), ("VoltEdge Power Bank 20000mAh", 1)], "nagad", 6000),
        (2, "pending", [("Craft&Co Ceramic Mug Set", 2)], "cod", 6000),
    ]

    for n, (days, status, items, provider, ship) in enumerate(ORDERS, 1):
        subtotal = sum(products[p]["price_minor"] * q for p, q in items)
        total = subtotal + ship
        when = f"datetime('now', '-{days} days')"
        cur = con.execute(
            "INSERT INTO orders (order_number,user_id,status,subtotal_minor,discount_minor,"
            f"shipping_minor,tax_minor,total_minor,currency,shipping_address_json,billing_address_json,"
            f"shipping_method,coupon_id,placed_at,created_at,updated_at) "
            f"VALUES (?,?,?,?,?,{ship},0,?, 'BDT',?,?,?,NULL,{when},{when},{when})",
            (f"SPD-2026-{1000+n}", uid, status, subtotal, 0, total, addr, addr,
             "standard"))
        oid = cur.lastrowid
        for p, q in items:
            row = products[p]
            con.execute(
                "INSERT INTO order_items (order_id,product_id,variant_id,name_snapshot,sku_snapshot,"
                f"unit_price_minor,quantity,discount_minor,tax_minor,line_total_minor,created_at,updated_at) "
                f"VALUES (?,?,NULL,?,?,{row['price_minor']},?,0,0,{row['price_minor']*q},{when},{when})",
                (oid, row["id"], row["name"], row["sku"], q))
        pay_status = "paid" if status in ("paid", "processing", "shipped", "delivered") else "pending"
        con.execute(
            "INSERT INTO payments (order_id,provider,method,amount_minor,currency,status,"
            f"gateway_transaction_id,idempotency_key,verified_at,created_at,updated_at) "
            f"VALUES (?,?,?,?,'BDT',?,?,?,{when if pay_status=='paid' else 'NULL'},{when},{when})",
            (oid, provider, provider, total, pay_status,
             f"DEMO-TX-{1000+n}", f"demo-idem-{1000+n}"))
        if status in ("shipped", "delivered"):
            con.execute(
                "INSERT INTO shipments (order_id,carrier,tracking_number,status,shipped_at,"
                f"delivered_at,created_at,updated_at,method) "
                f"VALUES (?,?,?,?,{when},{'NULL' if status=='shipped' else when},{when},{when},'standard')",
                (oid, "SpiderExpress", f"SE{200000+n}", status))

    con.commit()

    # --- summary -------------------------------------------------------------
    print("seeded:")
    for t in ["categories", "brands", "products", "product_variants",
              "product_images", "inventory", "orders", "order_items", "payments", "shipments"]:
        n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {n}")
    feat = con.execute(
        "SELECT name FROM products WHERE is_featured=1 AND status='published' LIMIT 6").fetchall()
    print("featured:", ", ".join(r["name"] for r in feat))
    con.close()


if __name__ == "__main__":
    main()
