document.addEventListener('DOMContentLoaded', function() {

    var content = document.querySelectorAll('.comma-number');
    content.forEach(function(node) {
        console.log(node.innerHTML);
        let number = parseInt(node.innerHTML);
        node.innerHTML = number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");        
    });

});