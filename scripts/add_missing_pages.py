"""Create the 3 missing Suite World pages."""
import json,urllib.request
BASE='http://localhost:50052'
SUITE='4bc6c50a-fbd2-4e1c-bca0-4ef3b0636d71'

pages_data = [
    {"slug":"home","title":"Suite World \u2014 Quality Furniture for Every Home","markdown":"""# Welcome to Suite World

Your trusted furniture destination in Dover, Kent. We have been helping customers across Kent find the perfect sofa, chair, and furniture suite for over 15 years.

## Why Choose Suite World?

- **Premium Brands** \u2014 La-Z-Boy, Sherborne, Alstons, and more
- **Flexible Finance** \u2014 Interest-free credit and payment plans available
- **Local Showroom** \u2014 See, sit, and feel before you buy at our Dover showroom
- **Free Local Delivery** \u2014 On orders over \u00a3499 within 20 miles

## Our Range

<div data-vibeful-widget='{"widget_id":"cat-leather","type":"card","props":{"title":"Leather Suites","content":"Luxury leather sofas, corner suites, and recliners from top brands. Built to last and timeless in style.","image_url":""}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-fabric","type":"card","props":{"title":"Fabric Suites","content":"Endless colours and textures. From classic weaves to modern velvets \u2014 your perfect fabric sofa awaits.","image_url":""}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-corner","type":"card","props":{"title":"Corner Suites","content":"Maximise your living space with our range of fabric and leather corner sofas.","image_url":""}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-recliner","type":"card","props":{"title":"Recliner Suites","content":"Ultimate comfort with manual and power recliners. Sink into a La-Z-Boy today.","image_url":""}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-sofabed","type":"card","props":{"title":"Sofa Beds","content":"Practical and stylish \u2014 our sofa beds are perfect for guests and multi-purpose rooms.","image_url":""}}'></div>

<div data-vibeful-widget='{"widget_id":"cat-chairs","type":"card","props":{"title":"Chair Centre","content":"From fireside chairs to riser recliners \u2014 find the perfect chair for any corner of your home.","image_url":""}}'></div>

## Visit Our Showroom
We are at 9-11 London Road, Dover, Kent, CT17 0ST. Open Monday-Saturday 9am-5:30pm, Sunday 10am-4pm. Call us on 01304 242422.

<div data-vibeful-widget='{"widget_id":"ask-home","type":"button","props":{"label":"Ask Our AI Assistant","variant":"primary"}}'></div>
"""},
    {"slug":"leather-suites","title":"Leather Suites \u2014 Luxury Leather Sofas & Corner Suites","markdown":"""# Leather Suites

Discover our collection of premium leather sofas, corner suites, and recliners. Leather furniture combines timeless elegance with everyday durability \u2014 perfect for family homes and contemporary living spaces.

## Our Leather Range

- **Leather Corner Sofas** \u2014 L-shaped luxury, ideal for open-plan living
- **Leather Recliner Sofas** \u2014 Ultimate comfort with built-in reclining mechanisms
- **Leather Sofa Beds** \u2014 Stylish by day, comfortable by night
- **Leather 2-Seaters** \u2014 Compact luxury for smaller rooms
- **Leather 3-Seaters** \u2014 The classic family sofa
- **Leather 4-Seaters** \u2014 Grand seating for larger living spaces
- **Leather Footstools** \u2014 The perfect finishing touch

## Why Choose Leather?

Leather furniture gets better with age. It is naturally durable, easy to clean, and hypoallergenic \u2014 making it ideal for families with children and pets. Our leather suites come in a range of colours from classic browns and blacks to contemporary greys and creams.

## Brands Available
Our leather range includes pieces from La-Z-Boy, Sherborne, Alstons, and more.

<div data-vibeful-widget='{"widget_id":"ask-leather","type":"button","props":{"label":"Ask About Leather Suites","variant":"primary"}}'></div>
"""},
    {"slug":"fabric-suites","title":"Fabric Suites \u2014 Stylish Fabric Sofas in Every Colour","markdown":"""# Fabric Suites

From classic weaves to modern velvets, our fabric suite collection offers endless possibilities. With hundreds of fabric choices across our brands, you are sure to find the perfect colour and texture for your home.

## Our Fabric Range

- **Fabric Corner Sofas** \u2014 Versatile L-shapes in your choice of fabric
- **Fabric Recliner Sofas** \u2014 Relaxed comfort with manual or power recliners
- **Fabric Sofa Beds** \u2014 Practical dual-purpose furniture
- **Fabric 2-Seaters** \u2014 Perfect for cosy spaces
- **Fabric 3-Seaters** \u2014 The family favourite
- **Fabric 4-Seaters** \u2014 Maximum seating for larger families
- **Fabric Footstools** \u2014 The finishing touch

## Why Choose Fabric?

Fabric sofas offer the widest choice of colours, patterns, and textures. From hard-wearing weaves perfect for busy family homes to luxurious velvets for a touch of glamour \u2014 fabric gives you design freedom.

## Brands Available
Our fabric range features pieces from Alstons, Florence Collections, Sherborne, Navinzi, and Ashwood Designs.

<div data-vibeful-widget='{"widget_id":"ask-fabric","type":"button","props":{"label":"Ask About Fabric Suites","variant":"primary"}}'></div>
"""},
]

for p in pages_data:
    print(f"Creating {p['slug']}...")
    payload=json.dumps({"agent_id":SUITE,"slug":p["slug"],"title":p["title"],"content_markdown":p["markdown"],"published":True}).encode()
    req=urllib.request.Request(BASE+"/v1/pages",data=payload,headers={"Content-Type":"application/json"})
    try:
        r=urllib.request.urlopen(req)
        result=json.loads(r.read())
        print(f"  OK - slug={result['slug']}")
    except Exception as e:
        print(f"  FAILED: {e}")
print("Done")
