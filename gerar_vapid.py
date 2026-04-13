from pywebpush import webpush, generate_vapid_key

private_key, public_key = generate_vapid_key()

print("PUBLIC KEY:")
print(public_key)

print("\nPRIVATE KEY:")
print(private_key)
