const App = (() => {
  const state = {
    user: null,
    products: []
  };

  const currency = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      },
      ...options
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(payload.error || 'Something went wrong.');
      error.fields = payload.fields || {};
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function formatCurrency(value) {
    return currency.format(Number(value) || 0);
  }

  function getPage() {
    return document.body.dataset.page || '';
  }

  function getElement(id) {
    return document.getElementById(id);
  }

  function showMessage(element, message, type = '') {
    if (!element) return;
    element.textContent = message || '';
    element.classList.toggle('success', type === 'success');
  }

  function showToast(message) {
    const toast = getElement('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => toast.classList.remove('visible'), 3500);
  }

  function setBusy(button, busy, busyLabel = 'Please wait…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = busyLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('.field-error').forEach((element) => {
      element.textContent = '';
    });
    form.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
      element.removeAttribute('aria-invalid');
    });
  }

  function applyFieldErrors(form, fields) {
    Object.entries(fields || {}).forEach(([field, message]) => {
      const input = form.querySelector(`[name="${CSS.escape(field)}"]`);
      if (!input) return;
      input.setAttribute('aria-invalid', 'true');
      const error = form.querySelector(`[data-error-for="${CSS.escape(field)}"]`);
      if (error) error.textContent = message;
    });
  }

  async function loadSession() {
    const result = await api('/api/session');
    state.user = result.user;
    return state.user;
  }

  function updateNavigation() {
    document.querySelectorAll('[data-user]').forEach((element) => {
      element.textContent = state.user ? state.user.username : '';
    });
    document.querySelectorAll('[data-auth-only]').forEach((element) => {
      element.hidden = !state.user;
    });
    document.querySelectorAll('[data-guest-only]').forEach((element) => {
      element.hidden = Boolean(state.user);
    });
  }

  async function protectPage() {
    try {
      await loadSession();
    } catch {
      state.user = null;
    }
    updateNavigation();

    if (document.body.dataset.authRequired === 'true' && !state.user) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.replace(`index.html?next=${next}`);
      return false;
    }
    return true;
  }

  function wireLogout() {
    document.querySelectorAll('[data-logout]').forEach((button) => {
      button.addEventListener('click', async () => {
        setBusy(button, true, 'Signing out…');
        try {
          await api('/api/logout', { method: 'POST' });
          window.location.replace('index.html');
        } catch (error) {
          showToast(error.message);
          setBusy(button, false);
        }
      });
    });
  }

  async function initLogin() {
    if (state.user) {
      window.location.replace('phone.html');
      return;
    }

    const form = getElement('loginForm');
    const message = getElement('loginMessage');
    if (!form) return;

    const params = new URLSearchParams(window.location.search);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      showMessage(message, '');
      if (!form.reportValidity()) return;

      const button = form.querySelector('button[type="submit"]');
      setBusy(button, true, 'Signing in…');
      try {
        const data = await api('/api/login', {
          method: 'POST',
          body: JSON.stringify({
            email: form.elements.email.value,
            password: form.elements.password.value
          })
        });
        state.user = data.user;
        const next = params.get('next');
        const destination = next && next.startsWith('/') ? next : 'phone.html';
        window.location.replace(destination);
      } catch (error) {
        showMessage(message, error.message);
        applyFieldErrors(form, error.fields);
        setBusy(button, false);
      }
    });
  }

  async function initRegistration() {
    if (state.user) {
      window.location.replace('phone.html');
      return;
    }

    const form = getElement('registrationForm');
    const message = getElement('registrationMessage');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      showMessage(message, '');
      if (!form.reportValidity()) return;

      const password = form.elements.password.value;
      const confirmPassword = form.elements.confirmPassword.value;
      if (password !== confirmPassword) {
        const confirmError = form.querySelector('[data-error-for="confirmPassword"]');
        if (confirmError) confirmError.textContent = 'Passwords do not match.';
        form.elements.confirmPassword.setAttribute('aria-invalid', 'true');
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      setBusy(button, true, 'Creating account…');
      try {
        const data = await api('/api/register', {
          method: 'POST',
          body: JSON.stringify({
            username: form.elements.username.value,
            email: form.elements.email.value,
            password
          })
        });
        state.user = data.user;
        window.location.replace('phone.html');
      } catch (error) {
        showMessage(message, error.message);
        applyFieldErrors(form, error.fields);
        setBusy(button, false);
      }
    });
  }

  async function loadProducts() {
    if (state.products.length) return state.products;
    const result = await api('/api/products');
    state.products = result.products;
    return state.products;
  }

  function createProductCard(product) {
    const card = document.createElement('article');
    card.className = 'product-card';

    const art = document.createElement('div');
    art.className = `product-art ${product.accent || ''}`;
    art.setAttribute('aria-hidden', 'true');
    art.textContent = product.emoji || '📱';

    const details = document.createElement('div');
    details.className = 'product-details';

    const title = document.createElement('h2');
    title.textContent = product.name;

    const description = document.createElement('p');
    description.className = 'product-description';
    description.textContent = product.description;

    const bottom = document.createElement('div');
    bottom.className = 'product-bottom';

    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = formatCurrency(product.price);

    const link = document.createElement('a');
    link.className = 'button';
    link.href = `Booking.html?product=${encodeURIComponent(product.id)}`;
    link.textContent = 'Buy now';

    bottom.append(price, link);
    details.append(title, description, bottom);
    card.append(art, details);
    return card;
  }

  async function initProducts() {
    const grid = getElement('productGrid');
    if (!grid) return;

    try {
      const products = await loadProducts();
      grid.replaceChildren(...products.map(createProductCard));
      const count = getElement('productCount');
      if (count) count.textContent = `${products.length} products available`;
    } catch (error) {
      grid.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = error.message;
      grid.append(empty);
    }
  }

  function setProductSummary(product) {
    const name = getElement('selectedProductName');
    const description = getElement('selectedProductDescription');
    const price = getElement('selectedProductPrice');
    const art = getElement('selectedProductArt');
    const total = getElement('orderTotal');
    const quantity = getElement('quantity');

    if (!product) {
      if (name) name.textContent = 'Choose a product';
      if (description) description.textContent = 'Select a product to see its details.';
      if (price) price.textContent = '—';
      if (art) art.textContent = '📱';
      if (total) total.textContent = '—';
      return;
    }

    if (name) name.textContent = product.name;
    if (description) description.textContent = product.description;
    if (price) price.textContent = formatCurrency(product.price);
    if (art) {
      art.textContent = product.emoji || '📱';
      art.className = `product-art ${product.accent || ''}`;
    }
    if (total) total.textContent = formatCurrency(product.price * Number(quantity?.value || 1));
  }

  async function initCheckout() {
    const form = getElement('checkoutForm');
    if (!form) return;

    const message = getElement('checkoutMessage');
    let products;
    try {
      products = await loadProducts();
    } catch (error) {
      showMessage(message, error.message);
      return;
    }
    const selector = form.elements.productId;
    const requestedProduct = new URLSearchParams(window.location.search).get('product');

    products.forEach((product) => {
      const option = document.createElement('option');
      option.value = product.id;
      option.textContent = `${product.name} — ${formatCurrency(product.price)}`;
      selector.append(option);
    });
    selector.value = products.some((product) => product.id === requestedProduct)
      ? requestedProduct
      : products[0]?.id || '';

    const updateSummary = () => {
      const product = products.find((candidate) => candidate.id === selector.value);
      setProductSummary(product);
    };
    selector.addEventListener('change', updateSummary);
    form.elements.quantity.addEventListener('input', updateSummary);
    updateSummary();

    if (state.user) {
      form.elements.customerName.value = state.user.username;
      form.elements.email.value = state.user.email;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);
      showMessage(message, '');
      if (!form.reportValidity()) return;

      const button = form.querySelector('button[type="submit"]');
      setBusy(button, true, 'Placing order…');
      try {
        const data = await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            productId: selector.value,
            quantity: Number(form.elements.quantity.value),
            customerName: form.elements.customerName.value,
            email: form.elements.email.value,
            phone: form.elements.phone.value,
            address: form.elements.address.value
          })
        });
        window.location.replace(`finalpage.html?order=${encodeURIComponent(data.order.id)}`);
      } catch (error) {
        showMessage(message, error.message);
        applyFieldErrors(form, error.fields);
        setBusy(button, false);
      }
    });
  }

  function setText(id, value) {
    const element = getElement(id);
    if (element) element.textContent = value || '—';
  }

  async function initConfirmation() {
    const orderId = new URLSearchParams(window.location.search).get('order');
    const empty = getElement('confirmationEmpty');
    const content = getElement('confirmationContent');
    if (!orderId) {
      if (empty) empty.hidden = false;
      if (content) content.hidden = true;
      return;
    }

    try {
      const result = await api(`/api/orders/${encodeURIComponent(orderId)}`);
      const order = result.order;
      setText('orderId', order.id);
      setText('orderDate', new Date(order.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
      setText('productName', order.product.name);
      setText('productQty', String(order.quantity));
      setText('productTotal', formatCurrency(order.total));
      setText('customerName', order.customer.name);
      setText('shippingAddress', order.customer.address);
      if (empty) empty.hidden = true;
      if (content) content.hidden = false;
    } catch (error) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = error.message;
      }
      if (content) content.hidden = true;
    }
  }

  async function init() {
    wireLogout();
    const page = getPage();
    const shouldProtect = document.body.dataset.authRequired === 'true' || page === 'login' || page === 'registration';
    if (shouldProtect) {
      const allowed = await protectPage();
      if (!allowed) return;
    } else {
      try {
        await loadSession();
      } catch {
        state.user = null;
      }
      updateNavigation();
    }

    if (page === 'login') await initLogin();
    if (page === 'registration') await initRegistration();
    if (page === 'products') await initProducts();
    if (page === 'checkout') await initCheckout();
    if (page === 'confirmation') await initConfirmation();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    api,
    formatCurrency,
    showToast
  };
})();
