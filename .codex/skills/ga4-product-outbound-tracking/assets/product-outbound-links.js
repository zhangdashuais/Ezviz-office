(function () {
  var seen = Object.create(null);

  document.querySelectorAll('a[data-product-id][href]').forEach(function (link) {
    var productId = link.dataset.productId.trim();
    var placement = (link.dataset.placement || '').trim();

    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(productId) ||
        (placement && !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(placement))) {
      console.error('Invalid GA4 product link identifier:', link);
      return;
    }

    link.id = link.id || 'cta-' + productId + (placement ? '-' + placement : '');
    if (seen[link.id]) console.error('Duplicate GA4 product link ID:', link.id);
    seen[link.id] = true;
  });
})();
